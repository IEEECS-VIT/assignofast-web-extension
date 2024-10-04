document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', async function () {
        try {
            const authResult = await getAuthToken();
            const userInfo = await getUserInfo(authResult.access_token);
            
            // Exchange Google ID token for Firebase auth data
            const firebaseUser = await signInToFirebase(authResult.id_token);
            const uid = firebaseUser.localId; // This is the Firebase UID

            // Save user data locally
            await saveUserData(uid, userInfo.email, authResult.id_token);

            // Send data to your backend
            console.log(firebaseUser.idToken);
            
            await sendToBackend(uid, firebaseUser.idToken);

            console.log('User data saved successfully');
            window.close();
        } catch (error) {
            console.error('Error during sign-in:', error);
        }
    });
});

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        const CLIENT_ID = '889572280066-lb6funq2ma5ak0qgk8dqfg2329hr2q7m.apps.googleusercontent.com';
        const REDIRECT_URL = chrome.identity.getRedirectURL();
        const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'openid'];

        const AUTH_URL =
            `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URL)}` +
            `&response_type=token id_token` +
            `&scope=${encodeURIComponent(SCOPES.join(' '))}`;

        chrome.identity.launchWebAuthFlow(
            { url: AUTH_URL, interactive: true },
            function (responseUrl) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    const url = new URL(responseUrl);
                    const params = new URLSearchParams(url.hash.substring(1));
                    const access_token = params.get('access_token');
                    const id_token = params.get('id_token');
                    if (access_token && id_token) {
                        resolve({ access_token, id_token });
                    } else {
                        reject(new Error('Failed to get tokens'));
                    }
                }
            }
        );
    });
}

async function getUserInfo(token) {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error('Failed to get user info');
    }
    return response.json();
}

async function signInToFirebase(googleIdToken) {
    const API_KEY = 'AIzaSyCwBHisi29c42yyP57K9B94WHFzYjYR4I8'; // Replace with your Firebase API key
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            postBody: `id_token=${googleIdToken}&providerId=google.com`,
            requestUri: chrome.identity.getRedirectURL(),
            returnIdpCredential: true,
            returnSecureToken: true
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Firebase Auth Error: ${error.error.message}`);
    }

    return response.json();
}

async function saveUserData(uid, email, idToken) {
    await chrome.storage.local.set({
        uid: uid,
        email: email,
        authToken: idToken,
        justSignedIn: true
    });
}

async function sendToBackend(uid, idToken) {
    const response = await fetch(`https://assignofast-backend.vercel.app/auth/login?uid=${uid}&googleAccessToken=${idToken}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    await chrome.storage.local.set({ backendToken: data.token });
}