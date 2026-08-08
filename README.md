# Cursor Duck 🦆

Eine Browser-Erweiterung für Chrome und Edge: Eine süße Ente schwimmt auf jeder Website
hinter deinem Mauszeiger her, pickt ihn ab und zu an, lässt sich streicheln und mit
Brotkrumen füttern, jagt Fischschatten — und macht zwischendurch, was Enten eben so
machen: gründeln, tauchen, putzen, baden, quaken, pennen.

Alles wird prozedural auf ein Canvas gezeichnet — **kein einziges Bild-Asset**. Dadurch ist
jede Ente bei jeder Größe scharf, und ein neues Modell sind ein paar Zeilen Farbwerte.

## Installation

1. `chrome://extensions` öffnen (in Edge: `edge://extensions`)
2. **Entwicklermodus** einschalten (Schalter oben rechts)
3. **Entpackte Erweiterung laden** klicken und diesen Ordner auswählen

Fertig — die Ente schwimmt los, und eine Willkommensseite erklärt kurz die Kunststücke.

## Was sie kann

| | |
|---|---|
| **Hinterherschwimmen** | Folgt dem Cursor mit Trägheit, schlängelt beim Paddeln, zieht Kielwasser und Bugwelle. Weit abgehängt? Dann sprintet sie. Dabei neigt sie sich in ihre Schwimmrichtung und dreht sich beim Kurswechsel sichtbar ein — bei steilem Kurs verkürzt sich der Körper leicht, als sähe man sie von vorn. |
| **Aufmerksam bleiben** | Zieht der Cursor weg, bricht sie laufende Spielereien ab und schwimmt hinterher. Springt der Cursor plötzlich (Fensterwechsel, iframe), merkt sie mit „!“ auf und holt extra flott auf. |
| **Streicheln** | Cursor über der Ente hin- und herwackeln → sie kneift die Augen zu ^^, wird rot, wackelt, Herzchen steigen auf. Voller Balken = glückliches Quaken. |
| **Cursor picken** | Maus stillhalten: sie holt auf und pickt den Zeiger an — mit Funken, Wasserring und „nom“. |
| **Füttern** | Doppelklick irgendwo auf die Seite wirft Brotkrumen ins Wasser — sie schwimmt hin und pickt sie einzeln auf, mit Häppchen-Ripples und zufriedenem Quaken. |
| **Fisch-Jagd** | Ab und zu zieht ein Fischschatten unter der Oberfläche vorbei. Sie entdeckt ihn („!“), jagt ihn, schnappt zu — und erwischt ihn nicht immer. Gefangene Fische zählt das Popup mit. |
| **Schwindel** | Den Cursor ein paarmal schnell um sie kreisen lassen → ihr wird schwummrig: sie taumelt, Sternchen kreisen, dann schüttelt sie sich. |
| **Erschrecken** | Ganz schnell durch sie durchwischen → sie fährt hoch, Federn fliegen, empörtes Quaken. |
| **Nickerchen** | 15 Sekunden Ruhe → Kopf ins Gefieder, Zzz. Wacht mit „!“ wieder auf. |
| **Idle-Animationen** | Gründeln (Popo hoch, Kopf unter Wasser), Tauchen mit Blasen und Auftauch-Splash, Gefieder putzen, Flügelschlagen, Schütteln, Baden, Pirouetten, Umschauen, Wippen, Quaken mit Notenwölkchen. |
| **Küken** | Bis zu 6 Küken schwimmen in einer Reihe auf Mamas Spur hinterher — mit eigenen kleinen Animationen und flauschig-gelbem Farbschema. |
| **Anklicken** | Klick auf die Ente → sie quakt zurück. Doppelklick auf die Ente → Flügelschlagen. |

## Die 31 Entenmodelle

**Echte Enten:** Stockente (Erpel & Weibchen), Quietsche-Ente, Pekingente, Mandarinente,
Brautente, Reiherente, Krickente, Laufente, Chonk-Ente, Küken, Schwan, Gans.

**Fantasie:** Debug-Ente (mit Brille), Cyber-Ente (Neon-Visor), Geister-Ente, Piraten-Ente,
Königs-Ente, Ninja-Ente, Goth-Ente, Party-Ente (mit Konfetti), Chefkoch-Ente, Zauber-Ente,
Astro-Ente (Helm), Zombie-Ente, Engels-Ente (Heiligenschein), Teufels-Ente, Cowboy-Ente,
Regenbogen-Ente, Galaxie-Ente (Sternenkörper), Goldene Ente.

Seltene Modelle sind im Popup markiert (blau = selten, lila = episch, gold = legendär).
Der 🎲-Knopf zieht zufällig — Legendäre sind selten.

## Einstellungen (Popup)

Größe, Tempo, Anzahl Küken, Verspieltheit, Sichtbarkeit, Ton an/aus, Wasser-Effekte,
Spiegelung, Cursor-Picken, Brotkrumen-Füttern, „Auf dieser Seite pausieren“ — alles greift
sofort, ohne Neuladen. Dazu zwölf Knöpfe, um Kunststücke direkt auszulösen (inklusive
Füttern, Fisch-Jagd und Schwindel).

Tastenkürzel: `Alt+Shift+D` (an/aus), `Alt+Shift+N` (nächstes Modell).

Der Ton ist per Voreinstellung **aus**. Eingeschaltet quakt sie synthetisch (Web Audio,
keine Sounddateien) — jedes Modell hat eine eigene Stimmlage, Küken piepsen hoch.

## Aufbau

```
manifest.json          Manifest V3
src/models.js          31 Entenmodelle: Farben, Proportionen, Accessoires, Effekte
src/render.js          Zeichnet eine Ente prozedural (Körper, Hals, Kopf, Schnabel,
                       Flügel, 12 Hüte, 5 Brillen, Wasserlinie, Spiegelung, Unterwasser)
src/effects.js         Partikel: Ringe, Tropfen, Herzchen, Federn, Blasen, Noten,
                       Zzz, Konfetti, Funkeln
src/engine.js          Schwimmphysik (mit Richtungs-Neigung), Verhaltens-Automat,
                       Streicheln, Füttern, Fisch-Jagd, Schwindel, Küken, Sound
src/content.js         Bootstrap im Tab, Live-Updates aus dem Storage
src/background.js      Service Worker: Defaults und Tastenkürzel
popup/                 Einstellungen mit Live-Vorschau
welcome/               Begrüßungsseite nach der Installation
icons/                 App-Symbole (mit demselben Renderer erzeugt)
```

Nicht Teil der Erweiterung, aber praktisch beim Entwickeln:

```
demo/index.html         Testwiese mit Steuerpult und allen Animationsknöpfen
demo/lab.html           Eine Ente groß, Pose per JS setzbar
demo/grid.html          Alle Modelle seitenweise
demo/poses.html         Ein Modell in allen Extremposen
demo/extension-sim.html Content-Script gegen eine nachgebaute chrome.*-API
demo/icons.html         Symbole rendern und speichern (braucht tools/iconserver.py)
```

Lokal starten:

```bash
python3 -m http.server 8777
```

Dann `http://localhost:8777/demo/index.html` öffnen.

## Technische Details

- **Manifest V3**, Berechtigungen nur `storage` und `activeTab`. Keine Netzwerkzugriffe,
  keine Datensammlung, keine externen Abhängigkeiten.
- Die Ente lebt in einem **Canvas im Shadow DOM** mit `pointer-events: none` ganz oben im
  Stapel — Klicks, Textauswahl und Seiten-CSS bleiben unberührt.
- In `<iframe>`s läuft nur ein Mini-Listener, der die Cursorposition ans Hauptfenster meldet;
  gezeichnet wird ausschließlich im obersten Fenster (eine Ente pro Tab, nicht eine pro Frame).
- Animation pausiert automatisch, wenn der Tab in den Hintergrund geht.
- Alle Bewegungen sind zeitbasiert interpoliert und damit unabhängig von der Bildrate.

## Eine eigene Ente bauen

In `src/models.js` einen Eintrag ergänzen:

```js
duck({
  id: 'meine-ente', name: 'Meine Ente', emoji: '🦆', tier: 'rare',
  body: '#88c0d0', bodyDark: '#5e81ac', belly: '#eceff4',
  head: '#88c0d0', headDark: '#5e81ac',
  beak: '#ebcb8b', beakDark: '#d08770',
  wing: '#81a1c1', wingBar: '#eceff4', tail: '#81a1c1', foot: '#ebcb8b',
  hat: 'crown',          // pirate|crown|party|ninja|tophat|wizard|chef|astro|halo|horns|cowboy|cap
  glasses: 'round',      // round|sun|visor|eyepatch|monocle
  crest: { len: 0.5, color: '#5e81ac', kind: 'tuft' },   // tuft|spike|fan
  glow: '#88c0d0', sparkle: 0.5, quackPitch: 1.2
})
```

Danach die ID in `MODEL_IDS` in `src/background.js` ergänzen, damit sie auch per
Tastenkürzel erreichbar ist.
