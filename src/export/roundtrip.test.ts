import { beforeEach, describe, expect, it } from 'vitest'
import { clearOutboxEntries, listRecords, outboxCount, putRecord } from '../data/db'
import { newId, nowIso } from '../domain/ids'
import {
  baseFields,
  RECORD_KINDS,
  type Adjustment,
  type BodyMetric,
  type CheckIn,
  type NutritionTarget,
  type SetLog,
  type StrengthReference,
  type TrainingPlan,
  type UserProfile,
  type WorkoutSession,
} from '../domain/records'
import { bodyMetricsCsv, checkinsCsv, setLogsCsv } from './csv'
import { buildExportBundle, exportFileName, exportJson } from './exportData'
import { ImportError, importBundle, importJson, validateBundle } from './importData'
import { SCHEMA_VERSION } from './format'

let userId: string

beforeEach(() => {
  userId = newId()
})

/** Legt von JEDER Datensatzart mindestens einen Eintrag an. */
async function seedEverything(target: string): Promise<void> {
  const at = nowIso()

  const profile: UserProfile = {
    ...baseFields(target, newId(), at),
    displayName: 'Luca',
    sex: 'male',
    birthYear: 2000,
    heightCm: 180,
    goal: 'muscle',
    targetWeightKg: 84,
    bodyFatBucket: '15-19',
    priorityMuscles: ['Brust', 'Lat'],
    level: 'intermediate',
    trainingYears: '2to5y',
    knowsRir: true,
    trainingDays: ['mon', 'tue', 'thu', 'fri'],
    sessionMinutes: 75,
    dailyActivity: 'light',
    injuries: [{ region: 'shoulder', severity: 'history' }],
    blacklistedExerciseIds: ['RUE-058'],
    disabledEquipmentIds: [],
    checkinWeekday: 'sun',
    intensity: 'demanding',
    feedbackStyle: 'rir',
    onboardingCompletedAt: at,
  }

  const reference: StrengthReference = {
    ...baseFields(target, newId(), at),
    exerciseId: 'BRU-001',
    pattern: 'horizontal_push',
    weightKg: 80,
    reps: 8,
    recordedAt: at,
  }

  const plan: TrainingPlan = {
    ...baseFields(target, newId(), at),
    version: 1,
    splitType: '4_upper_lower',
    trainingDays: ['mon', 'tue', 'thu', 'fri'],
    volumeTargets: { Brust: 16, Lat: 16, Quadrizeps: 13 },
    activeFrom: '2026-08-06',
    activeUntil: null,
    reason: 'Erstellt aus dem Onboarding',
  }

  const session: WorkoutSession = {
    ...baseFields(target, newId(), at),
    planId: plan.id,
    label: 'Oberkörper A',
    scheduledFor: '2026-08-06',
    startedAt: at,
    completedAt: at,
    status: 'completed',
    planned: [
      {
        exerciseId: 'BRU-001',
        exerciseName: 'Langhantel Bankdrücken flach',
        orderIndex: 0,
        sets: 4,
        targetReps: 8,
        repRangeMin: 5,
        repRangeMax: 10,
        targetSeconds: null,
        targetRir: 2,
        restSeconds: 150,
        weightKg: 82.5,
        warmups: [
          { weightKg: 40, reps: 8 },
          { weightKg: 60, reps: 5 },
        ],
        selectionReason: 'Priorität Brust, Slot 1',
      },
    ],
    sessionFeeling: 2,
    notes: 'Schulter fühlte sich gut an',
  }

  const setLog: SetLog = {
    ...baseFields(target, newId(), at),
    sessionId: session.id,
    exerciseId: 'BRU-001',
    exerciseName: 'Langhantel Bankdrücken flach',
    orderIndex: 0,
    setNumber: 1,
    isWarmup: false,
    prescribedWeightKg: 82.5,
    prescribedReps: 8,
    prescribedSeconds: null,
    prescribedRir: 2,
    actualWeightKg: 82.5,
    actualReps: 9,
    actualSeconds: null,
    feedback: 'more_left',
    rirDelta: 1.5,
    abandoned: false,
    loggedAt: at,
    deviceId: 'handy-luca',
    supersedesId: null,
  }

  const checkin: CheckIn = {
    ...baseFields(target, newId(), at),
    weekOf: '2026-08-03',
    weightKgAvg: 78.4,
    looks: 1,
    energy: 2,
    sleep: 'good',
    joints: 'none',
    motivation: 'high',
    calorieAdherence: 'good',
    submittedAt: at,
    notes: null,
  }

  const metric: BodyMetric = {
    ...baseFields(target, newId(), at),
    measuredOn: '2026-08-03',
    weightKg: 78.4,
    waistCm: 81.5,
    chestCm: 103,
    hipCm: null,
    armCm: 37.5,
    thighCm: null,
    calfCm: null,
    bodyFatBucket: '15-19',
    source: 'checkin',
  }

  const nutrition: NutritionTarget = {
    ...baseFields(target, newId(), at),
    effectiveFrom: '2026-08-03',
    kcal: 2870,
    proteinG: 140,
    fatG: 75,
    carbsG: 355,
    maintenanceKcal: 2620,
    targetRatePercentPerWeek: 0.2,
    reason: 'Aufbau: Erhaltungsbedarf + 250 kcal',
  }

  const adjustment: Adjustment = {
    ...baseFields(target, newId(), at),
    appliedAt: at,
    scope: 'exercise_progression',
    circle: 2,
    targetId: 'BRU-001',
    targetLabel: 'Langhantel Bankdrücken flach',
    before: '82,5 kg × 8',
    after: '82,5 kg × 9',
    reason: 'Übung erfüllt — Zielwiederholungen +1',
    applied: true,
    userAccepted: null,
  }

  await putRecord(target, 'profiles', profile)
  await putRecord(target, 'strengthReferences', reference)
  await putRecord(target, 'plans', plan)
  await putRecord(target, 'sessions', session)
  await putRecord(target, 'setLogs', setLog)
  await putRecord(target, 'checkins', checkin)
  await putRecord(target, 'bodyMetrics', metric)
  await putRecord(target, 'nutritionTargets', nutrition)
  await putRecord(target, 'adjustments', adjustment)
}

describe('Export', () => {
  it('enthält Geräte- und Übungs-Schnappschuss', async () => {
    await seedEverything(userId)
    const bundle = await buildExportBundle(userId)

    // Ohne diese beiden Blöcke wäre "BRU-001" in fünf Jahren bedeutungslos.
    expect(bundle.equipmentReference.length).toBe(61)
    expect(bundle.exercisesReference.length).toBe(381)
    expect(bundle.exercisesReference.some((e) => e.id === 'BRU-001')).toBe(true)
  })

  it('nennt Format-Version, Zeitpunkt und Profil', async () => {
    await seedEverything(userId)
    const bundle = await buildExportBundle(userId)

    expect(bundle.schemaVersion).toBe(SCHEMA_VERSION)
    expect(bundle.profileId).toBe(userId)
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(bundle.readme).toContain('selbsterklärend')
  })

  it('zählt jede Datensatzart und stimmt mit dem Inhalt überein', async () => {
    await seedEverything(userId)
    const bundle = await buildExportBundle(userId)

    for (const kind of RECORD_KINDS) {
      expect(bundle.counts[kind], kind).toBe(bundle.records[kind].length)
      expect(bundle.records[kind].length, kind).toBeGreaterThan(0)
    }
  })

  it('erzeugt gültiges JSON', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('baut einen sortierbaren Dateinamen', () => {
    const name = exportFileName('Luca', new Date('2026-08-06T12:00:00Z'))
    expect(name).toBe('fitness-coach-luca-2026-08-06.json')
  })
})

// ────────────────────────────────────────────────────────────────────
//  Der eigentliche Beweis
// ────────────────────────────────────────────────────────────────────

describe('Round-Trip — Export, Import, alles wieder da', () => {
  it('stellt jeden Datensatz in einem FREMDEN Profil vollständig wieder her', async () => {
    // Das ist der realistische Wiederherstellungsfall: Handy verloren,
    // neues Konto, Export einlesen.
    await seedEverything(userId)
    const json = await exportJson(userId)

    const neuesProfil = newId()
    const result = await importJson(neuesProfil, json)

    expect(result.warnings).toEqual([])

    for (const kind of RECORD_KINDS) {
      const original = await listRecords(userId, kind, { includeDeleted: true })
      const restored = await listRecords(neuesProfil, kind, { includeDeleted: true })

      expect(restored.length, kind).toBe(original.length)
      expect(result.imported[kind], kind).toBe(original.length)

      // Inhaltsgleich bis auf die Profil-Zuordnung
      const strip = (list: { userId: string }[]) =>
        [...list]
          .map(({ userId: _ignored, ...rest }) => rest)
          .sort((a, b) =>
            String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
          )

      expect(strip(restored), kind).toEqual(strip(original))
      // Und die Zuordnung zeigt aufs neue Profil
      expect(restored.every((r) => r.userId === neuesProfil), kind).toBe(true)
    }
  })

  it('erhält verschachtelte Strukturen wie die Trainingsvorgabe', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)
    const ziel = newId()
    await importJson(ziel, json)

    const sessions = await listRecords(ziel, 'sessions')
    const planned = sessions[0].planned[0]

    expect(planned.exerciseName).toBe('Langhantel Bankdrücken flach')
    expect(planned.warmups).toHaveLength(2)
    expect(planned.warmups[0]).toEqual({ weightKg: 40, reps: 8 })
    expect(planned.selectionReason).toBe('Priorität Brust, Slot 1')
  })

  it('erhält die Begründungen der Anpassungen', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)
    const ziel = newId()
    await importJson(ziel, json)

    const adjustments = await listRecords(ziel, 'adjustments')
    expect(adjustments[0].reason).toBe('Übung erfüllt — Zielwiederholungen +1')
    expect(adjustments[0].circle).toBe(2)
  })

  it('merkt die wiederhergestellten Daten zur Übertragung in die Cloud vor', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)

    const ziel = newId()
    await importJson(ziel, json)

    // Sonst lägen die Daten nach einer Wiederherstellung nur lokal.
    expect(await outboxCount(ziel)).toBe(RECORD_KINDS.length)
  })

  it('ist wiederholbar — zweimal importieren ändert nichts', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)
    const ziel = newId()

    const erst = await importJson(ziel, json)
    const zweit = await importJson(ziel, json)

    const gesamtErst = Object.values(erst.imported).reduce((a, b) => a + b, 0)
    const gesamtZweit = Object.values(zweit.imported).reduce((a, b) => a + b, 0)

    expect(gesamtErst).toBe(RECORD_KINDS.length)
    expect(gesamtZweit).toBe(0) // alles übersprungen
    expect(await listRecords(ziel, 'setLogs')).toHaveLength(1)
  })

  it('überschreibt bei "merge" keinen neueren lokalen Stand', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)

    const ziel = newId()
    await importJson(ziel, json)
    await clearOutboxEntries(ziel, [])

    // Lokal wird nach dem Import weitergearbeitet
    const [log] = await listRecords(ziel, 'setLogs')
    await putRecord(ziel, 'setLogs', { ...log, actualReps: 11 })

    // Derselbe (nun ältere) Export wird erneut eingelesen
    await importJson(ziel, json)

    const [danach] = await listRecords(ziel, 'setLogs')
    expect(danach.actualReps).toBe(11) // die neuere lokale Arbeit bleibt
  })

  it('lässt die Importdatei mit "replace" gewinnen', async () => {
    await seedEverything(userId)
    const json = await exportJson(userId)

    const ziel = newId()
    await importJson(ziel, json)
    const [log] = await listRecords(ziel, 'setLogs')
    await putRecord(ziel, 'setLogs', { ...log, actualReps: 11 })

    await importJson(ziel, json, { conflict: 'replace' })

    const [danach] = await listRecords(ziel, 'setLogs')
    expect(danach.actualReps).toBe(9) // Stand aus der Datei
  })
})

describe('Import-Prüfungen', () => {
  it('lehnt eine neuere Format-Version verständlich ab', () => {
    expect(() => validateBundle({ schemaVersion: '2.0', records: {} })).toThrow(ImportError)
    try {
      validateBundle({ schemaVersion: '2.0', records: {} })
    } catch (error) {
      expect((error as Error).message).toContain('App aktualisieren')
    }
  })

  it('lehnt kaputte Dateien ab, ohne etwas zu schreiben', async () => {
    await expect(importJson(userId, 'kein json')).rejects.toThrow(ImportError)
    await expect(importBundle(userId, { records: {} })).rejects.toThrow(/schemaVersion/)
    await expect(
      importBundle(userId, { schemaVersion: '1.0', records: { setLogs: 'text' } }),
    ).rejects.toThrow(/keine Liste/)

    expect(await listRecords(userId, 'setLogs')).toHaveLength(0)
  })

  it('warnt, wenn der Übungs-Schnappschuss fehlt', async () => {
    const result = await importBundle(userId, {
      schemaVersion: '1.0',
      records: {},
      counts: {},
      exercisesReference: [],
    })
    expect(result.warnings.join(' ')).toContain('Übungs-Schnappschuss')
  })

  it('warnt bei abweichenden Zählwerten', async () => {
    await seedEverything(userId)
    const bundle = await buildExportBundle(userId)
    bundle.counts.setLogs = 99

    const result = await importBundle(newId(), bundle)
    expect(result.warnings.join(' ')).toContain('nennt 99')
  })
})

describe('CSV — Bequemlichkeit für Excel', () => {
  it('nutzt deutsche Excel-Konventionen', async () => {
    await seedEverything(userId)
    const logs = await listRecords(userId, 'setLogs')
    const csv = setLogsCsv(logs)

    expect(csv.charCodeAt(0)).toBe(0xfeff) // BOM für UTF-8-Erkennung
    expect(csv).toContain(';') // Semikolon als Trenner
    expect(csv).toContain('82,5') // Komma als Dezimalzeichen
    expect(csv).toContain('mehr drin') // Abgleich in Worten
  })

  it('schreibt eine Kopfzeile und eine Zeile pro Satz', async () => {
    await seedEverything(userId)
    const logs = await listRecords(userId, 'setLogs')
    const zeilen = setLogsCsv(logs).trim().split('\r\n')

    expect(zeilen[0]).toContain('Übung')
    expect(zeilen).toHaveLength(1 + logs.length)
  })

  it('maskiert Semikolons und Anführungszeichen im Text', async () => {
    await seedEverything(userId)
    const checkins = await listRecords(userId, 'checkins')
    const mit = [{ ...checkins[0], notes: 'Test; mit "Zeichen"' }]
    const csv = checkinsCsv(mit)

    expect(csv).toContain('"Test; mit ""Zeichen"""')
  })

  it('exportiert Körperdaten inklusive Taille', async () => {
    await seedEverything(userId)
    const metrics = await listRecords(userId, 'bodyMetrics')
    const csv = bodyMetricsCsv(metrics)

    expect(csv).toContain('Taille (cm)')
    expect(csv).toContain('81,5')
  })
})
