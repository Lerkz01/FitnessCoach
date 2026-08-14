import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { equipmentById, exerciseById } from './data'
import { closeLocalDb, databaseName, listRecords, putRecord } from './data/db'
import { applyProgression } from './domain/applyProgression'
import { generateWeek, type GeneratedWeek } from './domain/generator'
import { newId, today } from './domain/ids'
import { loadBearingEquipment } from './domain/weights'
import type { VolumeMuscle } from './domain/muscles'
import { baseFields } from './domain/records'
import type {
  Adjustment,
  BodyMetric,
  CheckIn,
  NutritionTarget,
  SetLog,
  StrengthReference,
  TrainingPlan,
  UserProfile,
  Weekday,
  WorkoutSession,
} from './domain/records'
import {
  checkinDue,
  chronologically,
  mondayOf,
  weekdayToDateDay,
  weeksBetween,
} from './domain/week'
import { rotatedOutExerciseIds } from './domain/rotation'
import { weeklyReview, type WeeklyReview } from './domain/weeklyReview'
import { activeFocus, applyFocus, avoidedExerciseIds } from './domain/focus'
import { calibrationState, toCalibrationExercise } from './domain/calibration'
import {
  blockReview,
  blockReviewDue,
  blockReviewUseful,
  currentBlockStart,
  type BlockReview,
} from './domain/blockReview'
import { exerciseVolume } from './domain/volume'
import { Coach } from './screens/Coach'
import { Checkin } from './checkin/Checkin'
import { ReviewResult } from './checkin/ReviewResult'
import { Home, weekdayOf } from './Home'
import { Onboarding } from './onboarding/Onboarding'
import { NutritionScreen } from './screens/NutritionScreen'
import { Progress } from './screens/Progress'
import { applyReview, recordDeloadDecision } from './workout/applyReview'
import { Complete } from './workout/Complete'
import { abandonSession, startSession } from './workout/session'
import { Workout } from './workout/Workout'
import {
  currentAuth,
  onAuthChange,
  screenAfterAuthChange,
  signOut,
  type AuthState,
} from './auth/session'
import { SignIn } from './auth/SignIn'
import { BackupSection } from './screens/Backup'
import { setActiveSyncEngine } from './sync/active'
import { restoreFromCloud } from './sync/restore'
import { SupabaseAdapter } from './sync/supabaseAdapter'
import { supabase } from './sync/supabaseClient'
import { SyncEngine, type SyncStatus } from './sync/sync'
import { Button, Notice } from './ui/controls'
import { SyncBar } from './ui/SyncBar'
import { TabBar, type Tab } from './ui/TabBar'

/** Wie viele Tage die Einmess-Phase dauert (docs/PLAN-ENGINE.md §2). */
const CALIBRATION_DAYS = 10

type Screen =
  | 'loading'
  | 'signin'
  | 'onboarding'
  | 'tabs'
  | 'workout'
  | 'complete'
  | 'checkin'
  | 'review'

interface Loaded {
  profile: UserProfile
  /** Alle Planversionen — die erste liefert die Startwerte des Volumens. */
  plans: TrainingPlan[]
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  nutritionHistory: NutritionTarget[]
  references: StrengthReference[]
  metrics: BodyMetric[]
  sessions: WorkoutSession[]
  setLogs: SetLog[]
  checkins: CheckIn[]
  adjustments: Adjustment[]
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [tab, setTab] = useState<Tab>('today')
  const [data, setData] = useState<Loaded | null>(null)
  const [active, setActive] = useState<WorkoutSession | null>(null)
  const [sessionLogs, setSessionLogs] = useState<SetLog[]>([])
  const [review, setReview] = useState<WeeklyReview | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const userId = auth?.userId ?? null

  /**
   * Die zuletzt bekannte Profilkennung.
   *
   * Als Ref, weil der Anmelde-Horcher genau einmal eingehängt wird und in
   * seiner Abschlussumgebung sonst ewig den ersten Wert sähe.
   */
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const load = useCallback(async () => {
    if (userId === null) return
    try {
      const profiles = await listRecords(userId, 'profiles')
      const profile = profiles.find((p) => p.onboardingCompletedAt !== null)
      if (!profile) {
        setScreen('onboarding')
        return
      }

      const [plans, targets, references, metrics, sessions, setLogs, checkins, adjustments] =
        await Promise.all([
          listRecords(userId, 'plans'),
          listRecords(userId, 'nutritionTargets'),
          listRecords(userId, 'strengthReferences'),
          listRecords(userId, 'bodyMetrics'),
          listRecords(userId, 'sessions'),
          listRecords(userId, 'setLogs'),
          listRecords(userId, 'checkins'),
          listRecords(userId, 'adjustments'),
        ])

      // Pläne und Ernährungsziele sind versioniert. Gültig ist der jüngste
      // ohne Enddatum — nicht einfach der letzte in der Liste, denn die
      // Reihenfolge aus der Ablage sagt nichts über die Gültigkeit.
      const activePlan =
        [...plans]
          .filter((entry) => entry.deletedAt === null && entry.activeUntil === null)
          .sort((a, b) => (a.version < b.version ? 1 : -1))
          .at(0) ?? null

      const nutritionHistory = [...targets]
        .filter((entry) => entry.deletedAt === null)
        .sort(chronologically((entry) => entry.effectiveFrom))

      setData({
        profile,
        plans,
        plan: activePlan ?? plans.at(-1) ?? null,
        nutrition: nutritionHistory.at(-1) ?? null,
        nutritionHistory,
        references,
        metrics,
        sessions,
        setLogs,
        checkins: [...checkins]
          .filter((entry) => entry.deletedAt === null)
          .sort(chronologically((entry) => entry.weekOf)),
        adjustments,
      })

      // Eine begonnene Einheit hat Vorrang: Wer die App mitten im Training
      // schließt, soll sie genau dort wieder aufmachen.
      //
      // Aber nur, wenn sie von HEUTE ist. Ein Training zieht sich nicht über
      // Tage; eine liegengebliebene Einheit von letzter Woche wieder
      // anzubieten wäre verwirrend. Ältere werden deshalb geschlossen — sonst
      // sammeln sich offene Einheiten unbegrenzt an.
      const day = today()
      const open = sessions
        .filter((session) => session.status === 'active' && session.deletedAt === null)
        // Jüngste zuerst — bei mehreren offenen ist die letzte gemeint.
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

      const stale = open.filter((session) => dayOf(session) !== day)
      for (const session of stale) {
        await abandonSession({ userId, session, notes: 'Automatisch geschlossen (Vortag)' })
      }

      const resumable = open.find((session) => dayOf(session) === day) ?? null
      setActive(resumable)
      setSessionLogs(
        resumable ? setLogs.filter((log) => log.sessionId === resumable.id) : [],
      )
      setScreen('tabs')
      setLoadError(null)
    } catch (error) {
      // Ohne diese Behandlung bliebe die App stumm auf „Lade …" stehen — der
      // schlechteste mögliche Zustand, weil er nichts erklärt und sich nur
      // durch einen Neustart auflöst.
      setLoadError(error instanceof Error ? error.message : String(error))
    }
  }, [userId])

  // ── Anmeldung zuerst: Sie liefert die Profilkennung ──
  useEffect(() => {
    let abgebrochen = false

    void currentAuth().then((state) => {
      if (abgebrochen) return
      setAuth(state)
      if (state.needsSignIn) setScreen('signin')
    })

    // Auf Anmelden und Abmelden reagieren, auch in einem anderen Tab.
    const unsubscribe = onAuthChange((session) => {
      const nextId = session?.user.id ?? null
      const transition = screenAfterAuthChange(userIdRef.current, nextId)

      setAuth({
        userId: nextId,
        email: session?.user.email ?? null,
        needsSignIn: session === null,
        localOnly: false,
      })

      // Bei `keep` — erneuertes Token für denselben Nutzer — darf der
      // Bildschirm NICHT angefasst werden. Sonst hängt die App auf „Laden".
      if (transition === 'signin') setScreen('signin')
      else if (transition === 'reload') setScreen('loading')
    })

    return () => {
      abgebrochen = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (userId === null) return
    void load()
  }, [load, userId])

  // ── Sync-Motor: eine Instanz je angemeldetem Profil ──
  useEffect(() => {
    if (userId === null) return
    const client = supabase()
    if (!client) {
      setActiveSyncEngine(null)
      return
    }

    const engine = new SyncEngine({
      userId,
      adapter: new SupabaseAdapter(client),
      onStatusChange: setSyncStatus,
    })
    setActiveSyncEngine(engine)
    engine.start()

    return () => {
      engine.stop()
      setActiveSyncEngine(null)
    }
  }, [userId])

  // ── Woche erzeugen ──
  const bodyweightKg = useMemo(() => latestWeight(data?.metrics ?? []), [data?.metrics])

  const calibrationWeek = useMemo(() => {
    if (!data?.profile.onboardingCompletedAt) return true
    const since = Date.now() - Date.parse(data.profile.onboardingCompletedAt)
    return since < CALIBRATION_DAYS * 24 * 60 * 60 * 1000
  }, [data?.profile.onboardingCompletedAt])

  /**
   * Die Einmessphase: eine Runde durch den Split, bevor nach Plan trainiert
   * wird. Gezählt werden abgeschlossene Einmess-Einheiten, nicht Tage — wer
   * eine Woche aussetzt, soll nicht mit geschätzten Gewichten weitermachen.
   */
  const calibration = useMemo(
    () =>
      calibrationState({
        trainingDays: data?.profile.trainingDays ?? [],
        completedCalibrationSessions: (data?.sessions ?? []).filter(
          (session) =>
            session.kind === 'calibration' &&
            session.status === 'completed' &&
            session.deletedAt === null,
        ).length,
      }),
    [data?.profile.trainingDays, data?.sessions],
  )

  /**
   * Regelkreis 4. Bewusst hier und nicht im Check-in: Er läuft über einen
   * ganzen Block, nicht über eine Woche, und soll nicht in der wöchentlichen
   * Routine untergehen.
   */
  const block = useMemo<BlockReview | null>(() => {
    if (!data?.plan) return null
    const start = currentBlockStart({
      adjustments: data.adjustments,
      onboardingCompletedAt: data.profile.onboardingCompletedAt,
    })
    const heute = today()
    if (!blockReviewDue({ blockStartMonday: start, today: heute })) return null

    const fertig = data.sessions.filter(
      (session) => session.status === 'completed' && session.deletedAt === null,
    ).length
    if (!blockReviewUseful(fertig)) return null

    return blockReview({
      profile: data.profile,
      sessions: data.sessions,
      setLogs: data.setLogs,
      checkins: data.checkins,
      volumeTargets: data.plan.volumeTargets,
      blockStartMonday: start,
      today: heute,
      volumeForExercise: (exerciseId, sets) => {
        const exercise = exerciseById.get(exerciseId)
        return exercise ? exerciseVolume(exercise, sets) : {}
      },
    })
  }, [data?.plan, data?.profile, data?.sessions, data?.setLogs, data?.checkins, data?.adjustments])

  const logsBySession = useMemo(() => {
    const map = new Map<string, SetLog[]>()
    for (const log of data?.setLogs ?? []) {
      const list = map.get(log.sessionId)
      if (list) list.push(log)
      else map.set(log.sessionId, [log])
    }
    return map
  }, [data?.setLogs])

  const week = useMemo<GeneratedWeek | null>(() => {
    if (!data?.plan || bodyweightKg === null) return null
    try {
      // Wünsche aus dem Coach-Chat wirken HIER, beim Aufbau — nicht als
      // gespeicherte Änderung am Plan. Damit bleibt der Plan die rohe
      // Wahrheit, die Verschiebung ist jederzeit zurücknehmbar, und ein
      // Schwerpunkt kann sich über die Wochen nicht aufaddieren.
      const focus = applyFocus(
        data.plan.volumeTargets,
        activeFocus(data.adjustments),
        data.profile.priorityMuscles,
      )

      const generated = generateWeek({
        profile: data.profile,
        volumeTargets: focus.targets,
        references: data.references,
        bodyweightKg,
        calibrationWeek,
        // Zwei Quellen, dieselbe Tür: herausrotierte Übungen aus Regelkreis 3
        // und im Chat abgelehnte Übungen.
        excludeExerciseIds: new Set([
          ...rotatedOutExerciseIds(data.adjustments),
          ...avoidedExerciseIds(data.adjustments),
        ]),
      })

      const equipmentFor = (exerciseId: string) => {
        const exercise = exerciseById.get(exerciseId)
        return exercise ? loadBearingEquipment(exercise, equipmentById) : null
      }

      // Der Generator wählt die Übungen, kennt aber keine Historie. Ohne
      // diesen Schritt wären alle Gewichte und Wiederholungen wieder die
      // Erstschätzung aus dem Onboarding — der gesamte Fortschritt wäre
      // ohne Wirkung.
      return {
        ...generated,
        notes: [...generated.notes, ...focus.notes],
        sessions: generated.sessions.map((session) => {
          const angewandt = applyProgression({
            exercises: session.exercises,
            sessions: data.sessions,
            logsBySession,
            level: data.profile.level,
            goal: data.profile.goal,
            calibrationWeek,
            equipmentForExercise: equipmentFor,
            bodyweightTrendKg: weightTrend(data.metrics),
          })

          // In der Einmessphase wird aus derselben Übungsauswahl eine
          // Tast-Einheit. Erst NACH applyProgression, damit sie auf dem
          // bestmöglichen Startwert aufsetzt — auch eine Schätzung ist ein
          // besserer Ausgangspunkt als nichts.
          if (!calibration.active) return { ...session, exercises: angewandt }
          return {
            ...session,
            exercises: angewandt.map((exercise) => ({
              ...exercise,
              ...toCalibrationExercise(exercise, equipmentFor(exercise.exerciseId)),
            })),
          }
        }),
      }
    } catch {
      // Ein Fehler in der Planerzeugung darf die App nicht unbenutzbar
      // machen — der Startbildschirm zeigt dann einen Hinweis.
      return null
    }
  }, [
    data?.plan,
    data?.profile,
    data?.references,
    data?.sessions,
    data?.metrics,
    data?.adjustments,
    logsBySession,
    bodyweightKg,
    calibrationWeek,
    calibration.active,
  ])

  /**
   * Leert die lokale Ablage dieses Geräts.
   *
   * WICHTIG und der Grund, warum es diese Funktion überhaupt gibt: Der alte
   * Knopf rief nur `localStorage.clear()`. Das Profil liegt aber in IndexedDB
   * — der Knopf hat also nichts zurückgesetzt und war schlimmer als keiner,
   * weil er Erfolg vortäuschte.
   *
   * Reihenfolge: Verbindung zur Datenbank schließen (sonst bleibt das Löschen
   * hängen, bis der letzte Tab zu ist), dann löschen, dann neu laden.
   */
  const resetDevice = useCallback(async () => {
    const id = userIdRef.current
    if (id === null) return

    await closeLocalDb(id)
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName(id))
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      // `blocked` heißt: eine andere Lasche hält die Datenbank offen. Nicht
      // ewig warten — nach dem Neuladen ist sie zu und der nächste Versuch
      // greift.
      request.onblocked = () => resolve()
    })
    localStorage.clear()
    location.reload()
  }, [])

  /** Block abschließen — der nächste beginnt ab heute. */
  const acknowledgeBlock = useCallback(async () => {
    if (!data || userId === null) return
    const at = new Date().toISOString()
    const record: Adjustment = {
      ...baseFields(userId, newId(), at),
      appliedAt: at,
      scope: 'block_review',
      circle: 4,
      targetId: null,
      targetLabel: 'Block-Review',
      before: `Block über ${weeksBetween(
        currentBlockStart({
          adjustments: data.adjustments,
          onboardingCompletedAt: data.profile.onboardingCompletedAt,
        }),
        mondayOf(new Date()),
      )} Wochen`,
      after: 'durchgesehen, neuer Block',
      reason: 'Vom Nutzer zur Kenntnis genommen',
      applied: true,
      userAccepted: true,
    }
    await putRecord(userId, 'adjustments', record)
    setData((prev) =>
      prev ? { ...prev, adjustments: [...prev.adjustments, record] } : prev,
    )
  }, [data, userId])

  // ── Ablauf ──
  const begin = useCallback(
    async (weekday: Weekday) => {
      if (!data || !week || userId === null) return
      const generated = week.sessions.find((session) => session.weekday === weekday)
      if (!generated) return

      const session = await startSession({
        userId,
        planId: data.plan?.id ?? null,
        label: generated.label,
        exercises: generated.exercises,
        kind: calibration.active ? 'calibration' : 'plan',
      })
      setActive(session)
      setSessionLogs([])
      setScreen('workout')
    },
    [data, week, userId],
  )

  // ── Check-in ──
  const lastCheckin = data?.checkins.at(-1) ?? null

  const checkinPending = useMemo(() => {
    if (!data) return false
    return checkinDue({
      checkinWeekday: weekdayToDateDay(data.profile.checkinWeekday),
      lastCheckinWeekOf: lastCheckin?.weekOf ?? null,
    })
  }, [data, lastCheckin])

  const submitCheckin = useCallback(
    async (checkin: CheckIn) => {
      if (!data || userId === null) return
      const withUser: CheckIn = { ...checkin, userId }

      const result = weeklyReview({
        profile: data.profile,
        checkin: withUser,
        previousCheckins: data.checkins,
        calibrationWeek,
        volumeTargets: data.plan?.volumeTargets ?? {},
        startingVolumeTargets: startingTargets(data),
        nutrition: data.nutrition,
        metrics: data.metrics,
        sessions: data.sessions,
        logsBySession,
      })

      await applyReview({
        userId,
        profile: data.profile,
        checkin: withUser,
        review: result,
        plan: data.plan,
        nutrition: data.nutrition,
      })

      setReview(result)
      setScreen('review')
    },
    [data, userId, logsBySession, calibrationWeek],
  )

  // ── Wiederherstellung aus der Cloud ──
  const restore = useCallback(async () => {
    const client = supabase()
    if (!client || userId === null) return

    setRestoring('Hole deinen Fortschritt aus der Cloud …')
    try {
      const result = await restoreFromCloud({
        userId,
        adapter: new SupabaseAdapter(client),
        onProgress: (progress) =>
          setRestoring(`Hole deinen Fortschritt … ${progress.written} Datensätze`),
      })
      setRestoring(
        result.written === 0
          ? 'In der Cloud lag nichts Neues.'
          : `${result.written} Datensätze zurückgeholt.`,
      )
      await load()
    } catch (error) {
      setRestoring(
        `Zurückholen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      // Kurz stehen lassen, damit die Meldung lesbar ist.
      setTimeout(() => setRestoring(null), 2500)
    }
  }, [userId, load])

  if (screen === 'loading' || auth === null) {
    return (
      <div className="min-h-svh grid place-items-center px-8 text-center">
        {loadError !== null ? (
          <div className="space-y-4 max-w-sm">
            <Notice tone="warning">
              <span className="font-medium text-text">Laden fehlgeschlagen. </span>
              {loadError}
            </Notice>
            <p className="text-xs text-muted leading-relaxed">
              Deine Daten sind nicht verloren — sie liegen lokal und in der Cloud. Nur
              das Lesen hat gerade nicht geklappt.
            </p>
            <Button
              full
              onClick={() => {
                setLoadError(null)
                void load()
              }}
            >
              Nochmal versuchen
            </Button>
          </div>
        ) : (
          <p className="text-muted text-sm">{restoring ?? 'Lade …'}</p>
        )}
      </div>
    )
  }

  if (screen === 'signin' || userId === null) {
    return <SignIn onSignedIn={() => setScreen('loading')} />
  }

  if (screen === 'onboarding') {
    return <Onboarding userId={userId} onComplete={() => void load()} />
  }

  if (!data) {
    return (
      <div className="p-5">
        <Notice tone="warning">Kein Profil gefunden.</Notice>
      </div>
    )
  }

  if (screen === 'workout' && active) {
    return (
      <Workout
        userId={userId}
        session={active}
        calibrationWeek={calibrationWeek}
        profile={data.profile}
        references={data.references}
        bodyweightKg={bodyweightKg ?? 80}
        previousSessions={data.sessions.filter((s) => s.id !== active.id)}
        logsBySession={logsBySession}
        // Der Trainingsbildschirm hat den Datensatz umgeschrieben (Tausch
        // oder eingemessenes Gewicht). Ohne dieses Nachziehen würde der
        // Abschluss die Fassung vom Start zurückschreiben.
        onSessionChanged={(updated) => setActive(updated)}
        onFinished={(logs) => {
          setSessionLogs(logs)
          setScreen('complete')
        }}
        onAbandoned={() => {
          setActive(null)
          setSessionLogs([])
          void load()
          setScreen('tabs')
        }}
      />
    )
  }

  if (screen === 'complete' && active) {
    return (
      <Complete
        userId={userId}
        session={active}
        logs={sessionLogs}
        previousSessions={data.sessions.filter((session) => session.id !== active.id)}
        logsBySession={logsBySession}
        level={data.profile.level}
        goal={data.profile.goal}
        calibrationWeek={calibrationWeek}
        bodyweightTrendKg={weightTrend(data.metrics)}
        onDone={() => {
          setActive(null)
          setSessionLogs([])
          void load()
          setScreen('tabs')
        }}
      />
    )
  }

  if (screen === 'checkin') {
    return (
      <Checkin
        goal={data.profile.goal}
        weekNumber={
          data.checkins.length > 0
            ? weeksBetween(data.checkins[0].weekOf, mondayOf()) + 1
            : 1
        }
        lastWeightKg={lastCheckin?.weightKgAvg ?? null}
        onSubmit={(checkin) => void submitCheckin(checkin)}
        onCancel={() => setScreen('tabs')}
      />
    )
  }

  if (screen === 'review' && review) {
    return (
      <ReviewResult
        review={review}
        onDeload={(accepted) => {
          void recordDeloadDecision({ userId, review, accepted })
        }}
        onDone={() => {
          setReview(null)
          void load()
          setScreen('tabs')
        }}
      />
    )
  }

  const backupSection = (
    <BackupSection
      userId={userId}
      displayName={data.profile.displayName}
      status={syncStatus}
      localOnly={auth.localOnly}
      email={auth.email}
      onRestore={() => void restore()}
      onImported={() => void load()}
    />
  )

  return (
    <div className="min-h-svh flex flex-col">
      {/* Nur sichtbar, wenn etwas aussteht — siehe SyncBar. */}
      <SyncBar
        status={syncStatus}
        localOnly={auth.localOnly}
        onOpen={() => setTab('today')}
      />

      <div className="flex-1">
        {tab === 'today' ? (
          <Home
            profile={data.profile}
            plan={data.plan}
            nutrition={data.nutrition}
            week={week}
            today={weekdayOf()}
            calibration={calibration}
            blockReview={block}
            onAcknowledgeBlock={() => void acknowledgeBlock()}
            onResetDevice={resetDevice}
            checkinPending={checkinPending}
            backupSection={backupSection}
            accountEmail={auth.email}
            onSignOut={
              auth.localOnly
                ? null
                : () => {
                    void signOut()
                  }
            }
            onCheckin={() => setScreen('checkin')}
            openSessionLabel={active ? active.label : null}
            openSessionSets={
              active
                ? (logsBySession.get(active.id) ?? []).filter((log) => !log.isWarmup)
                    .length
                : 0
            }
            onStart={(weekday) => void begin(weekday)}
            onResume={() => setScreen('workout')}
            onDiscard={() => {
              if (!active) return
              void abandonSession({ userId, session: active }).then(() => {
                setActive(null)
                setSessionLogs([])
                void load()
              })
            }}
          />
        ) : null}

        {tab === 'progress' ? (
          <Progress
            profile={data.profile}
            plan={data.plan}
            metrics={data.metrics}
            sessions={data.sessions}
            logsBySession={logsBySession}
          />
        ) : null}

        {tab === 'coach' ? (
          <Coach
            userId={userId ?? ''}
            profile={data.profile}
            plan={data.plan}
            nutrition={data.nutrition}
            week={week}
            sessions={data.sessions}
            setLogs={data.setLogs}
            checkins={data.checkins}
            metrics={data.metrics}
            adjustments={data.adjustments}
            today={weekdayOf()}
            // Der Chat hat geschrieben — den Zustand nachziehen, damit die
            // Woche mit dem neuen Schwerpunkt sofort neu gerechnet wird.
            onChanged={(written) => {
              setData((prev) =>
                prev ? { ...prev, adjustments: [...prev.adjustments, ...written] } : prev,
              )
            }}
          />
        ) : null}

        {tab === 'nutrition' ? (
          <NutritionScreen
            profile={data.profile}
            nutrition={data.nutrition}
            history={data.nutritionHistory}
            adjustments={data.adjustments}
          />
        ) : null}
      </div>

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}

/**
 * Startwerte des Volumens — bei Fettverlust die Obergrenze.
 *
 * Genommen wird die ERSTE Planversion: Sie enthält die Zielsätze, mit denen
 * begonnen wurde. Der aktuelle Plan ist schon angepasst und wäre als
 * Obergrenze wertlos — er würde sich selbst als Grenze setzen und damit
 * jede Woche mitwachsen.
 */
function startingTargets(data: Loaded): Partial<Record<VolumeMuscle, number>> {
  const first = [...data.plans]
    .filter((entry) => entry.deletedAt === null)
    .sort((a, b) => a.version - b.version)
    .at(0)
  return first?.volumeTargets ?? data.plan?.volumeTargets ?? {}
}

/**
 * Kalendertag einer Einheit.
 *
 * `startedAt` ist ein UTC-Zeitstempel, `scheduledFor` ein lokaler Tag. Für
 * die Frage „ist das von heute?" zählt der lokale Tag, deshalb hat
 * `scheduledFor` Vorrang.
 */
function dayOf(session: WorkoutSession): string {
  if (session.scheduledFor !== null) return session.scheduledFor
  const stamp = session.startedAt ?? session.createdAt
  return new Date(stamp).toLocaleDateString('sv-SE')
}

/** Jüngstes gemessenes Körpergewicht. Es steht nur in `BodyMetric`. */
function latestWeight(metrics: readonly BodyMetric[]): number | null {
  const withWeight = metrics
    .filter((metric) => metric.weightKg !== null && metric.deletedAt === null)
    .sort(chronologically((metric) => metric.measuredOn))
  return withWeight.at(-1)?.weightKg ?? null
}

/** Gewichtsverlauf, älteste zuerst — für die Zielprüfung beim Fettverlust. */
function weightTrend(metrics: readonly BodyMetric[]): number[] {
  return metrics
    .filter((metric) => metric.weightKg !== null && metric.deletedAt === null)
    .sort(chronologically((metric) => metric.measuredOn))
    .map((metric) => metric.weightKg as number)
}
