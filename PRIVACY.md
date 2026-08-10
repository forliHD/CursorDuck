# Datenschutzerklärung — Cursor Duck

*Stand: 10. August 2026*

## Kurzfassung

Cursor Duck erhebt, speichert, überträgt und verkauft **keinerlei personenbezogene
Daten**. Die Erweiterung hat keine Netzwerkfunktionen und kommuniziert mit keinem
Server.

## Was die Erweiterung tut

Cursor Duck zeichnet eine animierte Ente auf ein transparentes Overlay über der
besuchten Webseite. Dafür liest sie ausschließlich die aktuelle Position des
Mauszeigers innerhalb des Browserfensters — diese wird nur im Arbeitsspeicher
verwendet, nie gespeichert und nie übertragen.

## Welche Daten gespeichert werden

Ausschließlich Ihre Einstellungen und harmlose Spielstände, lokal im Browser
bzw. in Ihrem Chrome-Profil (`chrome.storage.sync` / `chrome.storage.local`):

- gewähltes Entenmodell, Größe, Tempo, Küken-Anzahl, Verspieltheit,
  Sichtbarkeit, Effekt- und Ton-Einstellungen,
- die Liste der Seiten, auf denen Sie die Ente pausiert haben,
- Zähler wie Streicheleinheiten oder gefangene Fische.

Diese Daten verlassen Ihren Browser nicht (bei aktivierter Chrome-Synchronisation
synchronisiert Google sie wie alle Erweiterungsdaten zwischen Ihren eigenen
Geräten). Die Entwickler haben darauf keinen Zugriff.

## Was die Erweiterung NICHT tut

- keine Erhebung personenbezogener Daten,
- kein Auslesen von Seiteninhalten, Eingaben, Passwörtern oder Verlauf,
- keine Übertragung an Server, keine Analyse-/Tracking-Dienste,
- keine Cookies, keine Werbung, kein Verkauf von Daten,
- kein Nachladen von entferntem Code.

## Berechtigungen

- **storage** — speichert die oben genannten Einstellungen.
- **activeTab** — ermöglicht den Popup-Knöpfen, Kunststücke im aktuellen Tab
  auszulösen.
- **Zugriff auf alle Websites** — die Ente soll auf jeder besuchten Seite
  schwimmen können; dafür wird dort nur das Zeichen-Overlay eingefügt.

## Kontakt

Fragen zu dieser Datenschutzerklärung: GitHub-Profil
[forliHD](https://github.com/forliHD).

## Änderungen

Sollte sich der Funktionsumfang ändern, wird diese Erklärung aktualisiert und
die Änderung im Store-Eintrag vermerkt.
