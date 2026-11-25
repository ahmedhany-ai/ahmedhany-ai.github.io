import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Replace this object with the configuration from Firebase Console if needed.
export const firebaseConfig = {
  apiKey: "AIzaSyD_jAuVKY4dc0gMTVrmKXXCcPPBvSkUGxw",
  authDomain: "ah-studio-and-adam-ai-ass.firebaseapp.com",
  projectId: "ah-studio-and-adam-ai-ass",
  storageBucket: "ah-studio-and-adam-ai-ass.firebasestorage.app",
  messagingSenderId: "1032813219985",
  appId: "1:1032813219985:web:652e5842b636fa731caf30",
  measurementId: "G-MYXCTGHN55"
};

// Set this to the email address enabled for Email/Password sign-in in Firebase.
export const ADMIN_EMAIL = "ahmedhany152004@gmail.com";
export const INSTAPAY_DETAILS = "Set your InstaPay handle or payment instructions here";
export const VODAFONE_CASH_NUMBER = "Set your Vodafone Cash number here";
export const WHATSAPP_NUMBER = "Set your WhatsApp number with country code here";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
