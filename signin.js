document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');
    const buttonText = document.getElementById('button-text');
    const loader = document.querySelector('.loader');

    signInButton.addEventListener('click', async function () {
        try {
            loader.style.display = 'inline-block';
            buttonText.textContent = 'Signing in...';
            signInButton.disabled = true;

            const authResult = await getAuthToken();
            const userInfo = await getUserInfo(authResult.access_token);

            if (!userInfo.email.endsWith('@vitstudent.ac.in')) {
                throw new Error('Only @vitstudent.ac.in email addresses are allowed.');
            }
            
            const firebaseUser = await signInToFirebase(authResult.id_token);
            const uid = firebaseUser.localId; 

            const backendResponse = await sendToBackend(uid, firebaseUser.idToken);
            // console.log(firebaseUser.idToken);
            await saveUserData(uid, userInfo.email, backendResponse.token);

            console.log('User data saved successfully');

            buttonText.textContent = 'Signed in';
            loader.style.display = 'none';

            setTimeout(() => {
                window.close();
            }, 1000);

        } catch (error) {
            console.error('Error during sign-in:', error);
            loader.style.display = 'none';
            buttonText.textContent = 'Continue with Google';
            signInButton.disabled = false;
        }
    });
});

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        const CLIENT_ID = '889572280066-jcva8uk191u9746hc29liiulvf6sgel8.apps.googleusercontent.com';

        const REDIRECT_URL = chrome.identity.getRedirectURL();
        const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'openid'];

        const AUTH_URL =
            `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URL)}` +
            `&response_type=token id_token` +
            `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
            `&hd=vitstudent.ac.in`;

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
    const API_KEY = 'AIzaSyCwBHisi29c42yyP57K9B94WHFzYjYR4I8';
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

async function saveUserData(uid, email, authToken) {
    await chrome.storage.local.set({
        uid: uid,
        email: email,
        authToken: authToken 
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

    return response.json(); 
}