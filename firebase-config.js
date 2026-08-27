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
// 3. Danach in den "Regeln"-Tab der Realtime Database wechseln und durch
//    folgendes ersetzen (offen für Lese-/Schreibzugriff, wie der Rest der
//    App auch keine echte Benutzer-Anmeldung hat):
//      { "rules": { ".read": true, ".write": true } }
// 4. Zahnrad oben links -> "Projekteinstellungen" -> runterscrollen zu
//    "Meine Apps" -> "</>" (Web-App hinzufügen) -> Namen vergeben
//    -> registrieren. Der angezeigte "firebaseConfig"-Block kommt hier rein:
// ==========================================================================

const firebaseConfig = {
    apiKey: "DEIN_API_KEY",
    authDomain: "DEIN_PROJEKT.firebaseapp.com",
    databaseURL: "https://DEIN_PROJEKT-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "DEIN_PROJEKT",
    storageBucket: "DEIN_PROJEKT.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID",
    appId: "DEINE_APP_ID"
};

const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "DEIN_API_KEY" && !!firebaseConfig.databaseURL;

let db = null;
if (FIREBASE_CONFIGURED) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}
