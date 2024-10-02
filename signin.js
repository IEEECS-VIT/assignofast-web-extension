document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', async function () {
        try {
            const authToken = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, function (token) {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(token);
                });
            });

            const credential = firebase.auth.GoogleAuthProvider.credential(null, authToken);
            const userCredential = await firebase.auth().signInWithCredential(credential);
            const user = userCredential.user;
            const uid = user.uid;
            
            // Get ID token from Firebase
            const googleIdToken = await user.getIdToken();

            // Call your backend login endpoint
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
            
            // Save all necessary information to chrome storage
            await chrome.storage.local.set({ 
                uid: uid, 
                email: user.email, 
                authToken: data.token,
                justSignedIn: true 
            });

            console.log('User data saved successfully');
            window.close();
        } catch (error) {
            console.error('Error during sign-in:', error);
        }
    });
});