// ====================================================================
//  Übungsinfos — was die Übung ist und wie man sie ausführt
//
//  Zwei Quellen, bewusst getrennt:
//
//  1. ABGELEITETE ANGABEN aus der Übungsdatenbank: Zielmuskeln, Geräte,
//     einseitig oder nicht, Grundübung oder Isolation. Diese Angaben sind so
//     verlässlich wie die Datenbank und brauchen keine Pflege.
//
//  2. AUSFÜHRUNGSHINWEISE je BEWEGUNGSFAMILIE. Nicht je Übung: 372 einzelne
//     Texte wären zu 90 % Wiederholung, und wo sie es nicht wären, wären sie
//     erfunden. „Kurzhantel Bankdrücken flach" und „… Schrägbank"
//     unterscheiden sich im Winkel, nicht in der Technik.
//
//  Was hier NICHT steht, und zwar absichtlich: Diese Hinweise ersetzen keine
//  Einweisung. Sie nennen den Aufbau, die Bewegung und den häufigsten Fehler
//  — die drei Dinge, die man am Gerät wirklich braucht. Bei Schmerzen oder
//  einer völlig unbekannten Übung ist jemand vor Ort die richtige Quelle.
// ====================================================================

import { equipmentById } from '../data'
import type { Exercise } from '../types'
import { tierOf } from './prescription'
import { resolveMuscles } from './muscles'

// ────────────────────────────────────────────────────────────────────
//  Bewegungsfamilien
// ────────────────────────────────────────────────────────────────────

export type MovementFamily =
  | 'bench_press'
  | 'overhead_press'
  | 'dip'
  | 'pushup'
  | 'fly'
  | 'triceps_extension'
  | 'triceps_pushdown'
  | 'row'
  | 'pulldown'
  | 'pullup'
  | 'curl'
  | 'rear_delt'
  | 'lateral_raise'
  | 'front_raise'
  | 'shrug'
  | 'pullover'
  | 'squat'
  | 'leg_press'
  | 'hinge'
  | 'lunge'
  | 'leg_extension'
  | 'leg_curl'
  | 'calf_raise'
  | 'hip_thrust'
  | 'abduction'
  | 'crunch'
  | 'leg_raise'
  | 'rotation'
  | 'plank'
  | 'carry'
  | 'wrist'
  | 'explosive'
  | 'shoulder_rotation'
  | 'core_dynamic'
  | 'full_body_flow'
  | 'generic'

export interface FamilyInstruction {
  /** Kurzname der Bewegung für die Überschrift. */
  label: string
  /** Wie man sich hinstellt oder das Gerät einstellt. */
  setup: string
  /** Die Bewegung selbst, inklusive Bewegungsumfang. */
  execution: string
  /** Der häufigste Fehler — meist wirkungsvoller als drei weitere Hinweise. */
  mistake: string
}

/**
 * Die Hinweise selbst.
 *
 * Bewusst knapp: drei Sätze, die man zwischen zwei Sätzen im Gym auch liest.
 * Ein Absatz wird nicht gelesen, wenn der Puls bei 140 liegt.
 */
export const FAMILY_INSTRUCTIONS: Record<MovementFamily, FamilyInstruction> = {
  bench_press: {
    label: 'Drücken liegend',
    setup:
      'Schulterblätter zusammen und nach unten ziehen, Brust raus, Füße fest am Boden. Griff etwa schulterbreit plus eine Handbreite.',
    execution:
      'Kontrolliert bis zur Brust ablassen, Ellbogen etwa 45–75° zum Körper. Ohne Schwung nach oben drücken. Handgelenke bleiben über den Ellbogen.',
    mistake:
      'Schulterblätter locker lassen und die Ellbogen ganz nach außen kippen — beides verlagert die Last auf das Schultergelenk.',
  },
  overhead_press: {
    label: 'Drücken über Kopf',
    setup:
      'Rumpf fest, Rippen unten halten, Gesäß angespannt. Stange oder Hanteln auf Höhe des Schlüsselbeins.',
    execution:
      'Nach oben drücken, bis die Arme gestreckt sind und die Hanteln über der Schulter stehen. Kopf leicht nach vorn schieben, wenn die Stange vorbei ist.',
    mistake:
      'Ins Hohlkreuz ausweichen, um mehr Gewicht zu bewegen. Wenn das passiert, ist das Gewicht zu hoch.',
  },
  dip: {
    label: 'Dips',
    setup:
      'Auf den Griffen abstützen, Schultern aktiv nach unten, Brust leicht nach vorn für mehr Brust — aufrecht für mehr Trizeps.',
    execution:
      'Ablassen, bis der Oberarm etwa waagerecht ist. Nach oben drücken, ohne die Schultern hochzuziehen.',
    mistake:
      'Zu tief gehen. Fühlt sich vorne in der Schulter unangenehm an, ist der Bewegungsumfang zu groß.',
  },
  pushup: {
    label: 'Liegestütz',
    setup:
      'Hände etwas breiter als die Schultern, Körper eine Linie von Kopf bis Ferse, Gesäß angespannt.',
    execution:
      'Ablassen, bis die Brust knapp über dem Boden ist. Hochdrücken, ohne die Hüfte zuerst zu bewegen.',
    mistake:
      'Hüfte durchhängen lassen. Der Rumpf soll die ganze Zeit fest bleiben — dann ist es auch eine Bauchübung.',
  },
  fly: {
    label: 'Fliegende',
    setup:
      'Leichte Beugung im Ellbogen einstellen und über die ganze Bewegung beibehalten. Schulterblätter fest.',
    execution:
      'Arme in einem weiten Bogen öffnen, bis du die Brust deutlich gedehnt spürst. Zusammenführen, ohne die Ellbogen zu beugen.',
    mistake:
      'Die Bewegung in ein Drücken verwandeln, indem die Ellbogen beugen. Dann arbeitet der Trizeps mit und die Brust weniger.',
  },
  triceps_extension: {
    label: 'Trizepsstrecken',
    setup:
      'Oberarm fixieren — bei Überkopfvarianten zeigt der Ellbogen nach oben und bleibt dort.',
    execution:
      'Nur im Ellbogen beugen und strecken. In der gedehnten Position kurz halten, dann strecken bis fast durchgestreckt.',
    mistake:
      'Den Oberarm mitschwingen lassen. Bewegt sich der Ellbogen, macht die Schulter die Arbeit.',
  },
  triceps_pushdown: {
    label: 'Trizepsdrücken am Kabel',
    setup:
      'Aufrecht stehen, leicht nach vorn gelehnt, Ellbogen dicht am Körper.',
    execution:
      'Unterarme nach unten strecken, am Ende kurz anspannen. Kontrolliert zurück, bis der Ellbogen etwa 90° erreicht.',
    mistake:
      'Mit dem Oberkörper nachhelfen. Wenn du dich beim Drücken nach vorn wirfst, ist das Gewicht zu hoch.',
  },
  row: {
    label: 'Rudern',
    setup:
      'Brust raus, Rücken gerade, Schultern nach unten. Bei freien Varianten Hüfte beugen und Rumpf fest halten.',
    execution:
      'Griff zum Bauch ziehen, Schulterblätter zusammenführen. Kontrolliert zurück, bis die Arme gestreckt und die Schulterblätter auseinander sind.',
    mistake:
      'Mit dem Oberkörper schwingen. Der Rumpf bleibt still, nur die Arme und Schulterblätter bewegen sich.',
  },
  pulldown: {
    label: 'Latzug',
    setup:
      'Oberschenkelpolster einstellen, aufrecht sitzen, leichte Rücklage. Brust zur Stange.',
    execution:
      'Ellbogen nach unten zu den Rippen ziehen, bis die Stange etwa das Schlüsselbein erreicht. Langsam bis zur vollen Streckung zurück.',
    mistake:
      'Mit dem Oberkörper weit nach hinten lehnen. Aus einem Latzug wird dann ein Rudern.',
  },
  pullup: {
    label: 'Klimmzug',
    setup:
      'Hände etwa schulterbreit oder etwas weiter. Aus dem Hang zuerst die Schultern nach unten aktivieren.',
    execution:
      'Hochziehen, bis das Kinn über der Stange ist. Kontrolliert ablassen bis in die volle Streckung.',
    mistake:
      'Nur den halben Weg nach unten. Die gedehnte Position ist der Teil, der den Lat wachsen lässt.',
  },
  curl: {
    label: 'Bizepscurl',
    setup: 'Oberarm am Körper fixieren, Handgelenk gerade, Schultern nach hinten unten.',
    execution:
      'Nur im Ellbogen beugen, bis der Unterarm nicht weiter kommt. Langsam ablassen bis zur vollen Streckung.',
    mistake:
      'Ellbogen nach vorn wandern lassen und mit dem Rücken schwingen. Beides nimmt dem Bizeps die Arbeit ab.',
  },
  rear_delt: {
    label: 'Hintere Schulter',
    setup:
      'Oberkörper vorgebeugt oder Gerät so einstellen, dass die Arme waagerecht arbeiten. Leichte Beugung im Ellbogen.',
    execution:
      'Arme nach außen hinten führen, Bewegung kommt aus der Schulter. Am Endpunkt kurz halten.',
    mistake:
      'Zu schwer wählen und mit dem Rücken arbeiten. Diese Übung braucht wenig Gewicht und saubere Bahn.',
  },
  lateral_raise: {
    label: 'Seitheben',
    setup:
      'Leicht vorgebeugt, Ellbogen minimal gebeugt, Daumen etwa auf Höhe des kleinen Fingers oder leicht darunter.',
    execution:
      'Arme seitlich bis etwa Schulterhöhe heben — als würdest du sie auseinanderziehen, nicht hochwerfen. Langsam ablassen.',
    mistake:
      'Schwung aus den Knien und Schultern zu den Ohren ziehen. Die Bewegung ist klein und langsam.',
  },
  front_raise: {
    label: 'Frontheben',
    setup: 'Aufrecht stehen, Rumpf fest, Arme leicht gebeugt vor dem Körper.',
    execution: 'Arme nach vorn bis Schulterhöhe heben, dann kontrolliert ablassen.',
    mistake:
      'Über Schulterhöhe gehen und ins Hohlkreuz ausweichen. Darüber übernimmt der Trapez.',
  },
  shrug: {
    label: 'Schulterheben',
    setup: 'Arme gestreckt hängen lassen, Gewicht neben dem Körper oder vor den Beinen.',
    execution:
      'Schultern gerade nach oben zu den Ohren ziehen, kurz halten, kontrolliert ablassen.',
    mistake:
      'Kreisen. Die Schulter fährt gerade hoch und gerade runter, nicht im Kreis.',
  },
  pullover: {
    label: 'Überzüge',
    setup:
      'Quer oder längs auf der Bank, Rippen unten halten. Arme fast gestreckt mit fester leichter Beugung.',
    execution:
      'Gewicht in einem Bogen hinter den Kopf führen, bis du unter der Achsel eine Dehnung spürst. Zurück, ohne die Ellbogen zu beugen.',
    mistake:
      'Ins Hohlkreuz gehen, um weiter nach hinten zu kommen. Der Bewegungsumfang endet dort, wo der Rumpf fest bleibt.',
  },
  squat: {
    label: 'Kniebeuge',
    setup:
      'Füße etwa schulterbreit, Zehen leicht nach außen. Rumpf fest, Brust auf.',
    execution:
      'Hüfte und Knie gleichzeitig beugen, bis die Oberschenkel etwa waagerecht sind oder tiefer. Über die ganze Fußfläche nach oben drücken.',
    mistake:
      'Knie nach innen fallen lassen und die Ferse anheben. Beides zeigt, dass Gewicht oder Tiefe zu viel sind.',
  },
  leg_press: {
    label: 'Beinpresse',
    setup:
      'Rücken und Gesäß bleiben vollständig an der Lehne. Füße schulterbreit auf der Platte.',
    execution:
      'Ablassen, bis die Knie etwa 90° erreichen oder etwas tiefer — solange das Becken nicht abkippt. Drücken, ohne die Knie durchzuschlagen.',
    mistake:
      'So tief gehen, dass das Gesäß von der Lehne abhebt. Ab dort arbeitet die Lendenwirbelsäule mit.',
  },
  hinge: {
    label: 'Hüftbeugen',
    setup:
      'Füße hüftbreit, Knie leicht gebeugt, Rücken gerade. Schultern über oder leicht vor der Last.',
    execution:
      'Hüfte nach hinten schieben, Last nah am Körper führen, bis du die Oberschenkelrückseite deutlich gedehnt spürst. Hüfte nach vorn schieben zum Aufrichten.',
    mistake:
      'Aus dem Rücken heben statt aus der Hüfte. Rundet der untere Rücken, ist die Bewegung zu tief oder das Gewicht zu hoch.',
  },
  lunge: {
    label: 'Ausfallschritt',
    setup:
      'Ein Fuß vorn, ein Fuß hinten, Oberkörper aufrecht. Standbreite so, dass beide Knie beugen können.',
    execution:
      'Senkrecht ablassen, bis das hintere Knie fast den Boden berührt. Über den vorderen Fuß nach oben drücken.',
    mistake:
      'Zu kurzer Schritt, dadurch wandert das vordere Knie weit über die Zehen und der Schritt wird instabil.',
  },
  leg_extension: {
    label: 'Beinstrecker',
    setup:
      'Drehpunkt auf Kniehöhe einstellen, Polster über dem Sprunggelenk, nicht auf dem Fuß.',
    execution:
      'Beine strecken bis fast ganz durch, oben kurz anspannen. Langsam ablassen, ohne das Gewicht abzusetzen.',
    mistake:
      'Mit Schwung hochreißen und krachen lassen. Die Bremsphase ist der wirksame Teil.',
  },
  leg_curl: {
    label: 'Beinbeuger',
    setup:
      'Knie am Drehpunkt, Hüfte fest an der Auflage. Bei liegenden Varianten Becken nicht anheben.',
    execution:
      'Fersen zum Gesäß ziehen, kurz halten, langsam bis zur Streckung zurück.',
    mistake:
      'Becken mitheben, um weiter zu kommen. Dann macht der untere Rücken die Arbeit.',
  },
  calf_raise: {
    label: 'Wadenheben',
    setup: 'Fußballen auf der Kante, Fersen frei. Knie fast gestreckt oder gebeugt je nach Variante.',
    execution:
      'Ferse so weit absenken, wie es die Dehnung erlaubt, dann bis auf die Zehenspitzen drücken. Oben eine Sekunde halten.',
    mistake:
      'Schnell auf und ab federn. Die Wade reagiert auf Dehnung und Pause, nicht auf Tempo.',
  },
  hip_thrust: {
    label: 'Hüftstoß',
    setup:
      'Schulterblätter auf der Bank oder Rücken am Boden, Füße so, dass die Schienbeine am höchsten Punkt senkrecht stehen.',
    execution:
      'Hüfte nach oben strecken, bis Rumpf und Oberschenkel eine Linie bilden. Oben Gesäß fest anspannen, dann kontrolliert ablassen.',
    mistake:
      'Über die Linie hinaus ins Hohlkreuz gehen. Die Bewegung endet dort, wo die Rippen unten bleiben.',
  },
  abduction: {
    label: 'Beine öffnen und schließen',
    setup: 'Aufrecht sitzen, Rücken an der Lehne, Polster außen oder innen am Knie.',
    execution:
      'Langsam gegen den Widerstand öffnen oder schließen, am Endpunkt kurz halten und kontrolliert zurückführen.',
    mistake:
      'Mit dem Oberkörper mitschwingen. Der Rumpf bleibt still, die Bewegung kommt aus der Hüfte.',
  },
  crunch: {
    label: 'Crunch',
    setup: 'Auf dem Rücken oder im Gerät, unterer Rücken bleibt in Kontakt mit der Auflage.',
    execution:
      'Brustbein zum Becken einrollen — die Wirbelsäule beugt sich, die Hüfte bleibt ruhig. Langsam zurück.',
    mistake:
      'Am Kopf ziehen und mit geradem Rücken aufsetzen. Das ist Hüftbeugen, keine Bauchübung.',
  },
  leg_raise: {
    label: 'Beinheben',
    setup: 'Hängend oder liegend, Becken zunächst leicht nach hinten kippen.',
    execution:
      'Beine anheben und dabei das Becken einrollen — der letzte Teil kommt aus dem Bauch, nicht aus der Hüfte. Kontrolliert ablassen.',
    mistake:
      'Nur die Beine pendeln lassen. Ohne Beckenbewegung arbeitet fast nur der Hüftbeuger.',
  },
  rotation: {
    label: 'Rotation',
    setup: 'Stabiler Stand oder fester Sitz, Rumpf vorgespannt.',
    execution:
      'Drehung aus dem Rumpf, Arme bleiben lang und ändern ihre Stellung nicht. Kontrolliert zurückführen.',
    mistake:
      'Mit den Armen ziehen und die Wirbelsäule ruckartig verdrehen. Langsam und mit wenig Gewicht.',
  },
  plank: {
    label: 'Halten',
    setup:
      'Körper eine Linie, Rumpf und Gesäß angespannt, Schultern über oder direkt unter den Ellbogen.',
    execution:
      'Position halten und dabei ruhig weiteratmen. Die Zeit läuft, solange die Linie steht.',
    mistake:
      'Hüfte durchhängen lassen und die Zeit trotzdem weiterzählen. Sobald die Linie bricht, ist der Satz zu Ende.',
  },
  carry: {
    label: 'Tragen',
    setup: 'Aufrecht, Schultern nach hinten unten, Gewicht neben dem Körper oder vor der Brust.',
    execution:
      'Ruhig und kontrolliert gehen, Rumpf fest, Schritte normal lang. Die Zeit läuft, solange du sauber gehst.',
    mistake:
      'Zur Seite kippen oder die Schultern hochziehen. Dann ist das Gewicht zu hoch.',
  },
  wrist: {
    label: 'Unterarm',
    setup: 'Unterarme fest auflegen, nur die Hand ist frei beweglich.',
    execution: 'Handgelenk über den vollen Bewegungsumfang beugen oder strecken, langsam.',
    mistake: 'Mit dem Unterarm mitgehen. Nur das Handgelenk bewegt sich.',
  },
  explosive: {
    label: 'Explosive Bewegung',
    setup:
      'Diese Übung wird schnell ausgeführt und verlangt Technik. Ohne Einweisung besser eine ruhigere Alternative wählen.',
    execution:
      'Kraftvoll und flüssig, ohne die Endposition abzubremsen. Sauberer Satz vor mehr Gewicht.',
    mistake:
      'Gewicht vor Technik. Bei explosiven Übungen entstehen Fehler zu schnell, um sie im Satz zu korrigieren.',
  },
  shoulder_rotation: {
    label: 'Schulterrotation',
    setup:
      'Oberarm am Körper, Ellbogen 90° gebeugt und dort fixiert — am besten ein Handtuch zwischen Ellbogen und Rippen klemmen.',
    execution:
      'Nur der Unterarm dreht, nach außen oder innen. Kleiner Bewegungsumfang, langsames Tempo, ganz leichtes Gewicht.',
    mistake:
      'Zu schwer wählen. Diese Muskeln sind winzig; sobald der Oberkörper mitdreht, arbeitet nur noch der Rumpf.',
  },
  core_dynamic: {
    label: 'Rumpf in Bewegung',
    setup:
      'Rumpf und Gesäß vorspannen, Becken leicht nach hinten kippen. Der Oberkörper bleibt still.',
    execution:
      'Nur die Beine bewegen sich, in gleichmäßigem Tempo. Der untere Rücken bleibt am Boden bzw. die Hüfte ruhig.',
    mistake:
      'Schneller werden und dabei den Rumpf loslassen. Sobald der untere Rücken abhebt, arbeitet der Hüftbeuger statt des Bauchs.',
  },
  full_body_flow: {
    label: 'Bewegungsfolge',
    setup:
      'Mehrere Bewegungen hintereinander. Jeden Abschnitt einmal einzeln durchgehen, bevor du sie verbindest.',
    execution:
      'Ruhig und in einem Fluss, ohne zwischen den Abschnitten zu hetzen. Sauberer Ablauf vor Tempo und Gewicht.',
    mistake:
      'Die Folge schnell abarbeiten. Der Nutzen liegt in der Kontrolle über den ganzen Ablauf, nicht in der Zeit.',
  },
  generic: {
    label: 'Ausführung',
    setup:
      'Stabile Ausgangsposition, Rumpf fest, das arbeitende Gelenk frei beweglich. An Geräten das Gelenk auf den Drehpunkt einstellen.',
    execution:
      'Über den vollen Bewegungsumfang arbeiten, in der gedehnten Position kurz halten und beim Zurückführen bremsen.',
    mistake:
      'Mit Schwung arbeiten und den Bewegungsumfang verkürzen. Beides kostet Reiz, ohne Zeit zu sparen.',
  },
}

// ────────────────────────────────────────────────────────────────────
//  Zuordnung Übung → Familie
// ────────────────────────────────────────────────────────────────────

/**
 * Regeln von SPEZIFISCH nach ALLGEMEIN. Die erste passende gewinnt.
 *
 * Die Reihenfolge ist die eigentliche Logik: „Enges Bankdrücken" ist eine
 * Drückbewegung und keine Trizeps-Streckung, obwohl „Trizeps" im Zielmuskel
 * steht. Deshalb wird auf den NAMEN geprüft, nicht auf den Muskel — der Name
 * beschreibt die Bewegung.
 */
const RULES: { family: MovementFamily; match: RegExp }[] = [
  // Zuerst die explosiven, sie brauchen eine andere Ansprache
  { family: 'explosive', match: /power clean|high pull|umsetzen|snatch|reißen|swing|clean/i },

  // Bewegungsfolgen aus mehreren Abschnitten — brauchen eine eigene Ansprache,
  // weil kein einzelner Auf- und Ablauf beschreibbar ist.
  {
    family: 'full_body_flow',
    match: /burpee|turkish|get.?up|thruster|halo|around the world/i,
  },

  // Halten und Tragen — an der Metrik erkennbar, aber der Name ist eindeutiger
  {
    family: 'plank',
    match: /plank|planke|unterarmstütz|hollow|dead ?bug|pallof|bird ?dog|wall sit/i,
  },
  {
    family: 'core_dynamic',
    match: /mountain climber|flutter|scherenschlag|bicycle|fahrrad/i,
  },
  {
    family: 'lunge',
    match: /lunge|ausfallschritt|split squat|bulgarian|step.?up|aufsteigen|cossack/i,
  },
  { family: 'carry', match: /farmer|carry|walk|gehen|koffer/i },

  // Schulter- vor Rumpfrotation: „Kabel Außenrotation" dreht den Oberarm,
  // nicht den Rumpf. Der Hinweis „Drehung aus dem Rumpf" wäre dort falsch
  // und würde zu viel Gewicht nahelegen.
  {
    family: 'shoulder_rotation',
    match: /außenrotation|innenrotation|external rotation|internal rotation|cuban/i,
  },

  // Rumpf
  { family: 'rotation', match: /rotation|twist|woodchopper|russian|schräg.*(kabel|maschine)/i },
  {
    family: 'leg_raise',
    match: /beinheben|leg raise|knee raise|knieheben|reverse crunch|toes to bar/i,
  },
  { family: 'crunch', match: /crunch|sit.?up|käfer|crunches/i },

  // Arme
    // Gesäß-Kickback vor Trizeps-Kickback: gleicher Name, anderes Gelenk.
  { family: 'hip_thrust', match: /kickback.*(fußschlaufe|über kreuz|hinten)|glute kickback/i },
  { family: 'triceps_pushdown', match: /pushdown|trizepsdrücken|pressdown|kickback/i },
  {
    family: 'triceps_extension',
    match: /trizeps.*(strecken|extension)|skull|stirndrücken|french|überkopf.*trizeps|overhead extension/i,
  },
  // Beincurl VOR Bizepscurl: „Nordic Curls", „Sliding Leg Curl" und
  // „Kabel Beincurl" enthalten alle „curl", beugen aber das Knie.
  { family: 'leg_curl', match: /nordic|leg ?curl|beincurl|glute.?ham/i },

  // Handgelenk VOR Ellbogen: „Handgelenkcurls" enthält „curl", ist aber
  // keine Bizepsübung. Umgekehrt sind „Reverse Curls" trotz des Namens
  // Ellbogenarbeit (Brachioradialis) und bleiben deshalb bei `curl`.
  { family: 'wrist', match: /handgelenk|wrist ?curl/i },
  // `hammer` nur zusammen mit `curl`: „Hammer Press" ist Bankdrücken.
  { family: 'curl', match: /curl|beugen.*bizeps|hammer.?curl/i },

  // Schultern
  { family: 'lateral_raise', match: /seitheben|lateral raise|seitliches heben/i },
  { family: 'front_raise', match: /frontheben|front raise/i },
  {
    family: 'rear_delt',
    match: /reverse fly|butterfly reverse|face ?pull|hint.*schulter|vorgebeugtes seitheben|rear delt/i,
  },
  // Aufrechtes Rudern zieht senkrecht nach oben — „Griff zum Bauch ziehen"
  // aus der Ruder-Familie wäre die falsche Bewegung.
  { family: 'lateral_raise', match: /aufrechtes rudern|upright row/i },
  { family: 'shrug', match: /shrug|schulterheben|nackenziehen/i },
  {
    family: 'overhead_press',
    match: /überkopf|schulterdrücken|overhead|arnold|military|landmine press|pike push/i,
  },

  // Brust
  { family: 'fly', match: /fly|fliegende|butterfly|crossover|kabelzüge.*brust/i },
  { family: 'pullover', match: /pullover|überzüge/i },
  { family: 'pullup', match: /klimmz|pull.?up|chin.?up/i },
  { family: 'dip', match: /dip/i },
  { family: 'pushup', match: /liegestütz|push.?up/i },
  {
    family: 'bench_press',
    match: /bankdrücken|bench|chest press|brustpresse|floor press|drücken.*(flach|schräg|negativ)/i,
  },

  // Rücken
  { family: 'pullup', match: /klimmzug|pull.?up|chin.?up|muscle.?up/i },
  { family: 'pulldown', match: /latzug|pulldown|lat pull/i },
  { family: 'row', match: /rudern|row|ruder/i },

  // Beine
  { family: 'leg_extension', match: /beinstrecker|leg extension|sissy/i },
  { family: 'leg_curl', match: /beinbeuger|leg curl|nordic/i },
  { family: 'calf_raise', match: /waden|calf/i },
  { family: 'hip_thrust', match: /hip thrust|hüftstoß|glute bridge|beckenheben|brücke/i },
  { family: 'abduction', match: /abduktion|adduktion|abduktor|adduktor|abduct|adduct|abspreiz|beine schließen/i },
  { family: 'leg_press', match: /beinpresse|leg press/i },
  {
    family: 'lunge',
    match: /lunge|ausfallschritt|split squat|bulgarian|step.?up|aufsteigen|cossack/i,
  },
  {
    family: 'hinge',
    match: /kreuzheben|deadlift|rdl|romanian|rumänisch|good morning|hyperextension|back extension|rückenstrecker|hüftbeuge|pull.?through|rack pull/i,
  },
  { family: 'squat', match: /kniebeuge|squat|hack|beinbeuge/i },
]

/** Fallback über den Zielmuskel, wenn der Name nichts hergibt. */
const MUSCLE_FALLBACK: { family: MovementFamily; match: RegExp }[] = [
  { family: 'crunch', match: /bauchmuskel|rumpfstab/i },
  { family: 'calf_raise', match: /gastrocnemius|soleus|wade/i },
  { family: 'leg_curl', match: /hamstring/i },
  { family: 'leg_extension', match: /quadrizeps|vastus/i },
  { family: 'hip_thrust', match: /gesäß|gluteus/i },
  { family: 'abduction', match: /adduktoren/i },
  { family: 'curl', match: /bizeps|brachialis/i },
  { family: 'triceps_pushdown', match: /trizeps/i },
  { family: 'lateral_raise', match: /seitl\. schulter/i },
  { family: 'rear_delt', match: /hint\. schulter|rotatoren/i },
  { family: 'overhead_press', match: /vord\. schulter/i },
  { family: 'shrug', match: /trapez/i },
  { family: 'row', match: /ob\. rücken|lat/i },
  { family: 'hinge', match: /unt\. rücken|rückenstrecker/i },
  { family: 'wrist', match: /unterarm|griff/i },
  { family: 'fly', match: /brust/i },
]

export function movementFamilyOf(exercise: Exercise): MovementFamily {
  for (const rule of RULES) {
    if (rule.match.test(exercise.name)) return rule.family
  }

  // Zeitbasierte Übungen ohne Namenstreffer sind fast immer Halteübungen.
  if (exercise.metric === 'time') return 'plank'

  const muscles = exercise.primary.join(' ')
  for (const rule of MUSCLE_FALLBACK) {
    if (rule.match.test(muscles)) return rule.family
  }

  return 'generic'
}

// ────────────────────────────────────────────────────────────────────
//  Vollständige Info für die Anzeige
// ────────────────────────────────────────────────────────────────────

export interface ExerciseInstruction {
  family: MovementFamily
  instruction: FamilyInstruction
  /** Zielmuskeln in Klartext, Hauptmuskeln zuerst. */
  primaryMuscles: string[]
  secondaryMuscles: string[]
  /** Gerätenamen, an die man tatsächlich gehen muss. */
  equipment: string[]
  /** Zählt jede Seite einzeln? */
  unilateral: boolean
  /** Grundübung, Verbundübung oder Isolation — bestimmt die Erwartung. */
  tierLabel: string
  /** Hinweis zur Rolle im Plan, abgeleitet aus der Einstufung. */
  roleNote: string
}

const TIER_LABEL: Record<string, { label: string; note: string }> = {
  heavy_compound: {
    label: 'Schwere Grundübung',
    note: 'Steht am Anfang der Einheit, wenn du frisch bist. Hier wird nicht bis zum Muskelversagen trainiert — die Ermüdung würde den Rest der Einheit kosten.',
  },
  compound: {
    label: 'Verbundübung',
    note: 'Mehrere Gelenke arbeiten zusammen. Etwas Reserve im Tank lassen, damit die Technik hält.',
  },
  isolation: {
    label: 'Isolationsübung',
    note: 'Ein Gelenk, ein Ziel. Hier darf der letzte Satz bis an die Grenze gehen — das ist gewollt und billig zu erholen.',
  },
}

export function buildInstruction(exercise: Exercise): ExerciseInstruction {
  const family = movementFamilyOf(exercise)
  const tier = tierOf(exercise)
  const tierInfo = TIER_LABEL[tier] ?? TIER_LABEL.isolation

  return {
    family,
    instruction: FAMILY_INSTRUCTIONS[family],
    primaryMuscles: [...new Set(exercise.primary)],
    secondaryMuscles: [...new Set(exercise.secondary)].filter(
      (m) => resolveMuscles(m).length > 0,
    ),
    // „Körpergewicht" ist in der Datenbank ein Gerät, im Studio aber keins.
    // Als Zeile „Gerät: Körpergewicht" wäre es reines Rauschen.
    equipment: exercise.equipmentIds
      .filter((id) => id !== 'BODY')
      .map((id) => equipmentById.get(id)?.name)
      .filter((name): name is string => Boolean(name)),
    unilateral: exercise.unilateral,
    tierLabel: tierInfo.label,
    roleNote: tierInfo.note,
  }
}
