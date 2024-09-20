document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', function () {
        chrome.identity.getAuthToken({ interactive: true }, function (token) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }

            // Use the token to sign in to Firebase
            const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            console.log('Signing in with credential:', credential);
            firebase.auth().signInWithCredential(credential)
                .then((result) => {
                    const user = result.user;
                    const uid = user.uid;

                    // Store the UID and set a flag in Chrome storage
                    chrome.storage.local.set({ uid: uid, justSignedIn: true }, function () {
                        console.log('UID saved and justSignedIn flag set:', uid);

                        // Close the sign-in window
                        window.close();
                    });
                })
                .catch((error) => {
                    console.error('Error during sign-in:', error);
                });
        });
    });
});