// Authentication Functions

import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast } from './utils.js';

// Handle tab switching
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Update active tab
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show corresponding form
            authForms.forEach(form => form.classList.remove('active'));
            document.getElementById(`${tab}-form`).classList.add('active');

            // Clear message
            const messageDiv = document.getElementById('auth-message');
            if (messageDiv) {
                messageDiv.textContent = '';
                messageDiv.className = 'message';
            }
        });
    });

    // Login form handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Signup form handler
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Logout button handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const messageDiv = document.getElementById('auth-message');

    if (!email || !password) {
        const errorMsg = 'Please enter both email and password';
        if (messageDiv) {
            messageDiv.textContent = errorMsg;
            messageDiv.className = 'message error';
        } else {
            showToast(errorMsg, 'error');
        }
        return;
    }

    try {
        console.log('Attempting to login with email:', email);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Login successful, user UID:', user.uid);

        // Get user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        console.log('User document exists:', userDoc.exists());
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('User data:', userData);
            console.log('User role:', userData.role);
            
            showToast('Login successful!', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 500);
        } else {
            console.error('User document not found in Firestore');
            showToast('User data not found. Please sign up again.', 'error');
            // Sign out the user since their data doesn't exist
            await signOut(auth);
        }
    } catch (error) {
        console.error('Login error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        let errorMessage = error.message;
        
        // Provide user-friendly error messages
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email. Please sign up.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address. Please check your email.';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled. Please contact support.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed login attempts. Please try again later.';
        }
        
        if (messageDiv) {
            messageDiv.textContent = errorMessage;
            messageDiv.className = 'message error';
        } else {
            showToast(errorMessage, 'error');
        }
    }
}

// Handle signup
async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const role = document.getElementById('signupRole').value;
    const messageDiv = document.getElementById('auth-message');

    if (!role) {
        if (messageDiv) {
            messageDiv.textContent = 'Please select a role';
            messageDiv.className = 'message error';
        } else {
            showToast('Please select a role', 'error');
        }
        return;
    }

    try {
        // Create user with Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save user data to Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: name,
            email: email,
            role: role,
            createdAt: new Date()
        });

        showToast('Account created successfully!', 'success');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 500);
    } catch (error) {
        console.error('Signup error:', error);
        if (messageDiv) {
            messageDiv.textContent = error.message;
            messageDiv.className = 'message error';
        } else {
            showToast(error.message, 'error');
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
}

// Monitor auth state
onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.includes('index.html')) {
        // User is logged in, redirect to dashboard
        window.location.href = 'dashboard.html';
    }
});


