// ==========================================================================
// AJ - APP · Firebase-Konfiguration
//
// Hier eure eigenen Werte aus der Firebase Console eintragen, damit alle
// Geräte dieselbe Datenbank sehen (Kasse + Wetten laufen dann live sync).
//
// So bekommt ihr die Werte (kostenlos, 5 Minuten):
// 1. https://console.firebase.google.com öffnen -> "Projekt hinzufügen"
// 2. Im Projekt: "Build" -> "Realtime Database" -> "Datenbank erstellen"
//    -> Standort z.B. europe-west1 -> im "Testmodus" starten
// 3. "Build" -> "Authentication" -> "Sign-in method" -> "Anonym" aktivieren
//    (macht Nutzer im Hintergrund unsichtbar "eingeloggt", ohne Login-UI —
//    verhindert, dass Fremde ohne die App direkt auf die Datenbank-URL
//    zugreifen und Daten löschen/verändern können)
// 4. Danach im "Regeln"-Tab der Realtime Database durch folgendes ersetzen
//    (Zugriff nur für angemeldete — auch anonym angemeldete — Clients):
//      { "rules": { ".read": "auth != null", ".write": "auth != null" } }
//    WICHTIG: Schritt 3 zuerst erledigen, sonst kann sich die App nicht
//    mehr anmelden und die Regeln sperren alles aus.
// 5. Zahnrad oben links -> "Projekteinstellungen" -> runterscrollen zu
//    "Meine Apps" -> "</>" (Web-App hinzufügen) -> Namen vergeben
//    -> registrieren. Der angezeigte "firebaseConfig"-Block kommt hier rein:
// ==========================================================================

const firebaseConfig = {
    apiKey: "AIzaSyAFQl0P1MsmlgBt9NFXOeACMZalnU8G0Tw",
    authDomain: "aj-app-53f7a.firebaseapp.com",
    databaseURL: "https://aj-app-53f7a-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "aj-app-53f7a",
    storageBucket: "aj-app-53f7a.firebasestorage.app",
    messagingSenderId: "557670592229",
    appId: "1:557670592229:web:54590666ae498c65baee0c",
    measurementId: "G-3E151CNMSV"
};

const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "DEIN_API_KEY" && !!firebaseConfig.databaseURL;

let db = null;
if (FIREBASE_CONFIGURED) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}
