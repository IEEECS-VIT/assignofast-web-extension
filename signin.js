document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('signInButton');

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

                    // Store the UID in Chrome storage
                    chrome.storage.local.set({ uid: uid }, function () {
                        console.log('UID saved:', uid);

                        // Close the sign-in window
                        // window.close();
                    });
                })
                .catch((error) => {
                    console.error('Error during sign-in:', error);
                });
        });
    });
});