// Dashboard Routing

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast } from './utils.js';

// Check authentication and load dashboard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log('No user found in dashboard, redirecting to login');
        window.location.href = 'index.html';
        return;
    }

    console.log('Dashboard: User authenticated:', user.uid);

    try {
        // Get user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        console.log('Dashboard: User document exists:', userDoc.exists());
        
        if (!userDoc.exists()) {
            console.error('Dashboard: User document not found in Firestore');
            showToast('User data not found. Please sign up again.', 'error');
            await signOut(auth);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            return;
        }

        const userData = userDoc.data();
        const role = userData.role;
        const userName = userData.name || user.email;
        console.log('Dashboard: User role:', role);
        console.log('Dashboard: User name:', userName);

        // Update UI
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        
        if (userNameEl) userNameEl.textContent = `Welcome, ${userName}`;
        if (userRoleEl) {
            userRoleEl.textContent = role;
            userRoleEl.classList.add(role);
        }

        // Load role-based dashboard
        const loadingEl = document.getElementById('loading');
        const contentEl = document.getElementById('dashboard-content');

        if (role === 'teacher') {
            contentEl.innerHTML = `
                <div class="section">
                    <h2>Teacher Dashboard</h2>
                    <div class="card">
                        <h3>Manage Projects</h3>
                        <p>Create, edit, and delete projects. View student submissions and provide feedback.</p>
                        <button onclick="window.location.href='teacher.html'" class="btn btn-primary">Go to Teacher Panel</button>
                    </div>
                </div>
            `;
        } else if (role === 'student') {
            contentEl.innerHTML = `
                <div class="section">
                    <h2>Student Dashboard</h2>
                    <div class="card">
                        <h3>View Projects & Submit</h3>
                        <p>View available projects and submit your work with automatic timestamping.</p>
                        <button onclick="window.location.href='student.html'" class="btn btn-primary">Go to Student Panel</button>
                    </div>
                </div>
            `;
        }

        if (loadingEl) loadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
});


