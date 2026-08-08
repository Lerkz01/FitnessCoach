import { describe, expect, it } from 'vitest'
import {
  checkinDue,
  chronologically,
  localDay,
  localDayOf,
  mondayOf,
  weekdayToDateDay,
  weeksBetween,
} from './week'

/** Lokale Zeit, damit die Tests nicht von der Zeitzone abhängen. */
function at(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0)
}

describe('mondayOf', () => {
  it('gibt für einen Montag denselben Tag zurück', () => {
    expect(mondayOf(at(2026, 8, 3))).toBe('2026-08-03')
  })

  it('geht von Mitte der Woche zurück', () => {
    expect(mondayOf(at(2026, 8, 6))).toBe('2026-08-03') // Donnerstag
  })

  it('ordnet den SONNTAG der laufenden Woche zu, nicht der nächsten', () => {
    // Der klassische Fehler: Date.getDay() gibt für Sonntag 0. Ohne
    // Sonderbehandlung landete der Sonntag beim Montag DANACH — also in einer
    // Woche, die noch nicht stattgefunden hat. Und der Sonntag ist bei uns
    // der Standard-Check-in-Tag.
    expect(mondayOf(at(2026, 8, 9))).toBe('2026-08-03')
  })

  it('funktioniert über Monatsgrenzen', () => {
    expect(mondayOf(at(2026, 9, 2))).toBe('2026-08-31') // Mittwoch
  })

  it('funktioniert über Jahresgrenzen', () => {
    expect(mondayOf(at(2027, 1, 1))).toBe('2026-12-28') // Freitag
  })
})

describe('localDay', () => {
  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(localDay(at(2026, 3, 7))).toBe('2026-03-07')
  })

  it('nutzt die LOKALE Zeit, nicht UTC', () => {
    // Ein Zeitpunkt kurz nach Mitternacht lokal darf nicht auf den Vortag
    // rutschen, weil UTC noch nicht so weit ist.
    const kurzNachMitternacht = new Date(2026, 7, 9, 0, 30, 0)
    expect(localDay(kurzNachMitternacht)).toBe('2026-08-09')
  })
})

describe('weeksBetween', () => {
  it('zählt ganze Wochen', () => {
    expect(weeksBetween('2026-08-03', '2026-08-31')).toBe(4)
  })

  it('gibt null für denselben Montag', () => {
    expect(weeksBetween('2026-08-03', '2026-08-03')).toBe(0)
  })

  it('kommt mit unbrauchbaren Angaben zurecht', () => {
    expect(weeksBetween('kaputt', '2026-08-03')).toBe(0)
  })
})

describe('checkinDue', () => {
  const sonntag = 0
  const mittwoch = 3

  it('steht am gewählten Tag an', () => {
    expect(
      checkinDue({ checkinWeekday: sonntag, lastCheckinWeekOf: null, at: at(2026, 8, 9) }),
    ).toBe(true)
  })

  it('steht davor nicht an', () => {
    expect(
      checkinDue({ checkinWeekday: sonntag, lastCheckinWeekOf: null, at: at(2026, 8, 6) }),
    ).toBe(false)
  })

  it('bleibt nachholbar, wenn der Tag verpasst wurde', () => {
    // Ein vergessener Check-in soll nicht verfallen.
    expect(
      checkinDue({ checkinWeekday: mittwoch, lastCheckinWeekOf: null, at: at(2026, 8, 8) }),
    ).toBe(true)
  })

  it('steht nicht an, wenn diese Woche schon abgegeben wurde', () => {
    expect(
      checkinDue({
        checkinWeekday: sonntag,
        lastCheckinWeekOf: '2026-08-03',
        at: at(2026, 8, 9),
      }),
    ).toBe(false)
  })

  it('steht in der neuen Woche wieder an', () => {
    expect(
      checkinDue({
        checkinWeekday: sonntag,
        lastCheckinWeekOf: '2026-08-03',
        at: at(2026, 8, 16),
      }),
    ).toBe(true)
  })
})

describe('weekdayToDateDay', () => {
  it('bildet unsere Zählung auf die von Date.getDay() ab', () => {
    // WEEKDAYS beginnt bei Montag, Date.getDay() bei Sonntag. Genau hier
    // entstehen Verschiebungen um einen Tag.
    expect(weekdayToDateDay('mon')).toBe(1)
    expect(weekdayToDateDay('sat')).toBe(6)
    expect(weekdayToDateDay('sun')).toBe(0)
  })

  it('deckt alle sieben Tage lückenlos ab', () => {
    const alle = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(weekdayToDateDay)
    expect([...alle].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('fällt bei unbekannter Angabe auf Sonntag zurück', () => {
    expect(weekdayToDateDay('kaputt')).toBe(0)
  })
})

describe('chronologically', () => {
  it('sortiert nach Tag', () => {
    const items = [
      { measuredOn: '2026-08-09', createdAt: 'a' },
      { measuredOn: '2026-08-03', createdAt: 'b' },
    ]
    expect(
      [...items].sort(chronologically((i) => i.measuredOn)).map((i) => i.measuredOn),
    ).toEqual(['2026-08-03', '2026-08-09'])
  })

  it('entscheidet bei gleichem Tag über den Anlagezeitpunkt', () => {
    // Der Fall, der im Browser „−0,4 kg" erzeugte: Onboarding und erster
    // Check-in am selben Tag. Ohne Zweitschlüssel ist die Reihenfolge
    // beliebig, und der Fortschritt zeigt einen Verlust, den es nicht gab.
    const items = [
      { measuredOn: '2026-08-09', createdAt: '2026-08-09T12:00:00.000Z', kg: 84.4 },
      { measuredOn: '2026-08-09', createdAt: '2026-08-09T08:00:00.000Z', kg: 84 },
    ]
    expect(
      [...items].sort(chronologically((i) => i.measuredOn)).map((i) => i.kg),
    ).toEqual([84, 84.4])
  })

  it('ist stabil bei vollständig gleichen Zeitstempeln', () => {
    const items = [
      { measuredOn: '2026-08-09', createdAt: 'x', id: 1 },
      { measuredOn: '2026-08-09', createdAt: 'x', id: 2 },
    ]
    expect([...items].sort(chronologically((i) => i.measuredOn)).map((i) => i.id)).toEqual([
      1, 2,
    ])
  })
})

describe('localDayOf', () => {
  it('gibt den LOKALEN Tag, nicht den UTC-Tag', () => {
    // Der Fehler, der im Browser die Zeitreihe verdrehte: Ein Eintrag von
    // 00:55 lokaler Zeit trägt in UTC noch das Datum des Vortags. Ein
    // slice(0, 10) auf den ISO-Zeitstempel liefert also den falschen Tag.
    const stamp = new Date(2026, 7, 9, 0, 55, 0).toISOString()
    expect(localDayOf(stamp)).toBe('2026-08-09')
  })

  it('stimmt mit localDay überein', () => {
    const date = new Date(2026, 7, 9, 23, 30, 0)
    expect(localDayOf(date.toISOString())).toBe(localDay(date))
  })

  it('gibt bei unbrauchbarer Eingabe wenigstens die ersten zehn Zeichen', () => {
    expect(localDayOf('kaputt')).toBe('kaputt')
  })
})
