// ====================================================================
//  Wochenauswertung anwenden
//
//  `weeklyReview` entscheidet, `applyReview` schreibt. Getrennt, weil die
//  Entscheidung eine reine Rechnung ist (jederzeit wiederholbar) und das
//  Schreiben ein Nebeneffekt.
//
//  Was geschrieben wird:
//
//    Check-in           der Datensatz selbst
//    BodyMetric         das Wochengewicht als Punkt der Zeitreihe
//    TrainingPlan       neue Version, wenn sich Volumen geändert hat
//    NutritionTarget    neue Version, wenn sich Kalorien geändert haben
//    Adjustment         JEDE Änderung, mit Begründung
//
//  Pläne und Ernährungsziele werden VERSIONIERT, nicht überschrieben: Der
//  Verlauf der Anpassungen ist selbst eine Information — die App muss später
//  zeigen können, wann sie was warum verstellt hat (docs/UI-UX.md §9).
// ====================================================================

import { putRecord } from '../data/db'
import { newId, nowIso, today } from '../domain/ids'
import { localDayOf } from '../domain/week'
import type { VolumeMuscle } from '../domain/muscles'
import type {
  Adjustment,
  BodyMetric,
  CheckIn,
  NutritionTarget,
  TrainingPlan,
  UserProfile,
} from '../domain/records'
import type { WeeklyReview } from '../domain/weeklyReview'
import { requestUpload } from '../sync/active'

export interface ApplyReviewInput {
  userId: string
  profile: UserProfile
  checkin: CheckIn
  review: WeeklyReview
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  /** Hat der Nutzer dem Deload zugestimmt? `null` = nicht gefragt. */
  deloadAccepted?: boolean | null
}

export interface ApplyReviewResult {
  plan: TrainingPlan | null
  nutrition: NutritionTarget | null
  adjustments: Adjustment[]
}

export async function applyReview(input: ApplyReviewInput): Promise<ApplyReviewResult> {
  const { userId, checkin, review } = input
  const at = nowIso()
  const adjustments: Adjustment[] = []

  const record = (
    fields: Omit<Adjustment, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
  ): Adjustment => ({
    id: newId(),
    userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...fields,
  })

  // ── Check-in selbst ──
  await putRecord(userId, 'checkins', checkin)

  // ── Wochengewicht in die Zeitreihe ──
  if (checkin.weightKgAvg !== null) {
    const metric: BodyMetric = {
      id: newId(),
      userId,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      // Datiert auf den LOKALEN Tag der Abgabe, nicht auf den Wochenanfang.
      //
      // `measuredOn` ist die Achse der Zeitreihe. Mit `weekOf` läge ein
      // Check-in vom Sonntag vor einem Onboarding vom Donnerstag derselben
      // Woche — die Reihe wäre verdreht und die App läse daraus einen
      // Gewichtsverlust, den es nie gab. Die Wochenzuordnung steckt im
      // Check-in selbst, nicht in diesem Datum.
      measuredOn: localDayOf(checkin.submittedAt),
      weightKg: checkin.weightKgAvg,
      waistCm: null,
      chestCm: null,
      hipCm: null,
      armCm: null,
      thighCm: null,
      calfCm: null,
      bodyFatBucket: null,
      source: 'checkin',
    }
    await putRecord(userId, 'bodyMetrics', metric)
  }

  // ── Volumen ──
  let plan = input.plan
  const changedVolume = review.volume.filter((change) => change.after !== change.before)

  if (plan && changedVolume.length > 0) {
    const volumeTargets: Partial<Record<VolumeMuscle, number>> = { ...plan.volumeTargets }
    for (const change of review.volume) volumeTargets[change.muscle] = change.after

    plan = {
      ...plan,
      id: newId(),
      createdAt: at,
      updatedAt: at,
      version: plan.version + 1,
      volumeTargets,
      activeFrom: today(),
      activeUntil: null,
      reason: `Wochenauswertung ${checkin.weekOf}: ${changedVolume.length} Muskelgruppen angepasst.`,
    }
    await putRecord(userId, 'plans', plan)

    // Der alte Plan wird nicht gelöscht — er bekommt ein Enddatum. So bleibt
    // nachvollziehbar, unter welcher Vorgabe eine Einheit stattfand.
    if (input.plan) {
      await putRecord(userId, 'plans', { ...input.plan, activeUntil: today() })
    }

    for (const change of changedVolume) {
      adjustments.push(
        record({
          appliedAt: at,
          scope: 'volume',
          circle: 3,
          targetId: change.muscle,
          targetLabel: change.muscle,
          before: `${format(change.before)} Sätze/Woche`,
          after: `${format(change.after)} Sätze/Woche`,
          reason: change.reason,
          applied: true,
          userAccepted: null,
        }),
      )
    }
  }

  // ── Kalorien ──
  let nutrition = input.nutrition
  if (nutrition && review.nutrition.next) {
    const next = review.nutrition.next
    const before = nutrition

    nutrition = {
      ...nutrition,
      id: newId(),
      createdAt: at,
      updatedAt: at,
      effectiveFrom: today(),
      kcal: next.kcal,
      proteinG: next.proteinG,
      fatG: next.fatG,
      carbsG: next.carbsG,
      reason: review.nutrition.reason,
    }
    await putRecord(userId, 'nutritionTargets', nutrition)

    adjustments.push(
      record({
        appliedAt: at,
        scope: 'nutrition',
        circle: 3,
        targetId: null,
        targetLabel: 'Kalorien',
        before: `${before.kcal} kcal`,
        after: `${next.kcal} kcal`,
        reason: review.nutrition.reason,
        applied: true,
        userAccepted: null,
      }),
    )
  } else if (review.nutrition.blocked) {
    // Auch die NICHT-Änderung wird protokolliert. Sonst wirkt es, als hätte
    // die App das Thema übersehen — und der Grund wäre nicht nachlesbar.
    adjustments.push(
      record({
        appliedAt: at,
        scope: 'nutrition',
        circle: 3,
        targetId: null,
        targetLabel: 'Kalorien',
        before: input.nutrition ? `${input.nutrition.kcal} kcal` : '—',
        after: 'unverändert',
        reason: review.nutrition.reason,
        applied: false,
        userAccepted: null,
      }),
    )
  }

  // ── Deload ──
  if (review.deload.recommendation !== 'none') {
    adjustments.push(
      record({
        appliedAt: at,
        scope: 'deload',
        circle: 3,
        targetId: null,
        targetLabel: 'Entlastungswoche',
        before: 'normales Training',
        after: input.deloadAccepted ? review.deload.shape : 'vorgeschlagen',
        reason: review.deload.signals.join(' · '),
        applied: input.deloadAccepted === true,
        userAccepted: input.deloadAccepted ?? null,
      }),
    )
  }

  // ── Übungsrotation ──
  //
  // Wird als ANGEWANDT protokolliert, sobald ein Ersatz gefunden wurde. Der
  // Eintrag ist die Wahrheit, aus der `rotatedOutExerciseIds` ableitet, was
  // beim nächsten Planaufbau draußen bleibt — er ist also kein Vermerk,
  // sondern die Ursache der Wirkung.
  //
  // Wirksam wird er erst beim nächsten Planaufbau, nicht mitten in der
  // Woche: Ein Tausch zwischen zwei Einheiten derselben Woche zerstört die
  // Vergleichbarkeit, auf der die Progression beruht.
  for (const rotation of review.rotations) {
    const hatErsatz = rotation.replacementId !== null
    adjustments.push(
      record({
        appliedAt: at,
        scope: 'exercise_rotation',
        circle: 3,
        targetId: rotation.exerciseId,
        targetLabel: rotation.exerciseName,
        before: rotation.exerciseName,
        after: hatErsatz
          ? (rotation.replacementName as string)
          : 'kein passender Ersatz gefunden',
        reason: rotation.reason,
        applied: hatErsatz,
        userAccepted: null,
      }),
    )
  }

  for (const adjustment of adjustments) {
    await putRecord(userId, 'adjustments', adjustment)
  }

  requestUpload()
  return { plan, nutrition, adjustments }
}

/**
 * Hält die Antwort auf den Deload-Vorschlag fest.
 *
 * Bewusst NICHT über `applyReview`: Das würde den Check-in und damit auch
 * das Wochengewicht ein zweites Mal schreiben — und ein zweiter
 * `BodyMetric` für dieselbe Woche würde den Gewichtsverlauf verfälschen.
 */
export async function recordDeloadDecision(input: {
  userId: string
  review: WeeklyReview
  accepted: boolean
}): Promise<Adjustment> {
  const at = nowIso()
  const adjustment: Adjustment = {
    id: newId(),
    userId: input.userId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    appliedAt: at,
    scope: 'deload',
    circle: 3,
    targetId: null,
    targetLabel: 'Entlastungswoche',
    before: 'vorgeschlagen',
    after: input.accepted ? input.review.deload.shape : 'abgelehnt',
    reason: input.review.deload.signals.join(' · '),
    applied: input.accepted,
    userAccepted: input.accepted,
  }
  await putRecord(input.userId, 'adjustments', adjustment)
  requestUpload()
  return adjustment
}

function format(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}
