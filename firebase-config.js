// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCwBHisi29c42yyP57K9B94WHFzYjYR4I8",
    authDomain: "assigno-fast.firebaseapp.com",
    databaseURL: "https://assigno-fast-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "assigno-fast",
    storageBucket: "assigno-fast.appspot.com",
    messagingSenderId: "1017339246220",
    appId: "1:1017339246220:web:22ed5f8be4d5d336aeada9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the auth service
const auth = firebase.auth();
