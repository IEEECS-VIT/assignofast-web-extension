document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', async function () {
        try {
            // Request a new token
            const authToken = await getAuthToken();

            // Proceed with Firebase authentication
            await authenticateWithFirebase(authToken);

            console.log('User data saved successfully');
            window.close();
        } catch (error) {
            console.error('Error during sign-in:', error);
        }
    });
});

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        const CLIENT_ID = '889572280066-5pb75orpmet827onhpcq96hsansaer1f.apps.googleusercontent.com';
        const REDIRECT_URL = chrome.identity.getRedirectURL();
        const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];

        const AUTH_URL =
            `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URL)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(SCOPES.join(' '))}`;

        chrome.identity.launchWebAuthFlow(
            { url: AUTH_URL, interactive: true },
            function (responseUrl) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    const url = new URL(responseUrl);
                    const params = new URLSearchParams(url.hash.substring(1));
                    const token = params.get('access_token');
                    if (token) {
                        resolve(token);
                    } else {
                        reject(new Error('Failed to get access token'));
                    }
                }
            }
        );
    });
}

async function authenticateWithFirebase(authToken) {
    const credential = firebase.auth.GoogleAuthProvider.credential(null, authToken);
    const userCredential = await firebase.auth().signInWithCredential(credential);
    const user = userCredential.user;
    const uid = user.uid;

    const googleIdToken = await user.getIdToken();

    const response = await fetch(`https://assignofast-backend.vercel.app/auth/login?uid=${uid}&googleAccessToken=${googleIdToken}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    await chrome.storage.local.set({
        uid: uid,
        email: user.email,
        authToken: data.token,
        justSignedIn: true
    });
}