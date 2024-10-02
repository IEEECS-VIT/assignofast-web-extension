document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', async function () {
        try {
            // Revoke the current token if it exists
            await revokeToken();

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

async function revokeToken() {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, function(token) {
            if (token) {
                chrome.identity.removeCachedAuthToken({ token: token }, function() {
                    chrome.identity.clearAllCachedAuthTokens(resolve);
                });
            } else {
                resolve();
            }
        });
    });
}

async function getAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(token);
            }
        });
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