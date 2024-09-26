document.addEventListener('DOMContentLoaded', function () {
    const signInButton = document.getElementById('google-btn');

    signInButton.addEventListener('click', function () {
        chrome.identity.getAuthToken({ interactive: true }, function (token) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }

            const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            console.log('Signing in with credential:', credential);
            firebase.auth().signInWithCredential(credential)
                .then((result) => {
                    const user = result.user;
                    const uid = user.uid;

                    chrome.storage.local.set({ uid: uid, email: user.email, justSignedIn: true }, function () {
                        console.log('UID and email saved, and justSignedIn flag set:', uid , user.email);
                        window.close();
                    });
                })
                .catch((error) => {
                    console.error('Error during sign-in:', error);
                });
        });
    });
});