// Student Dashboard Functions

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    updateDoc,
    doc, 
    getDocs, 
    getDoc,
    query, 
    where,
    orderBy,
    Timestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, formatTimestamp, requireAuth, isPastDue } from './utils.js';

let currentUser = null;
let currentStudentId = null;
let currentProjectId = null;

// Initialize student dashboard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log('No user found, redirecting to login');
        window.location.href = 'index.html';
        return;
    }

    try {
        console.log('User authenticated:', user.uid);
        currentUser = user;
        
        // Get user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        console.log('User document:', userDoc.exists() ? userDoc.data() : 'NOT FOUND');
        
        if (!userDoc.exists()) {
            console.error('User document does not exist in Firestore');
            showToast('User data not found. Please sign up again.', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            return;
        }

        const userData = userDoc.data();
        const userRole = userData.role;
        console.log('User role:', userRole);

        if (userRole !== 'student') {
            console.error('Access denied. User role is:', userRole);
            showToast(`Access denied. Student access required. Your role is: ${userRole}`, 'error');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }

        currentStudentId = user.uid;

        // Update UI
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = `Welcome, ${userData.name || user.email}`;

        // Load projects and submissions
        console.log('Loading projects and submissions...');
        await loadProjects();
        await loadSubmissions();

        // Setup modal
        setupModal();

        // Setup submit form
        const submitForm = document.getElementById('submit-form');
        if (submitForm) {
            submitForm.addEventListener('submit', handleSubmit);
        }

        console.log('Student dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing student dashboard:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showToast(`Error loading dashboard: ${errorMessage}`, 'error');
        
        // Check for specific errors
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        } else if (error.code === 'unauthenticated') {
            showToast('You must be logged in to access this page.', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        }
    }
});

// Load available projects
async function loadProjects() {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) {
        console.error('Projects list element not found');
        return;
    }

    try {
        projectsList.innerHTML = '<div class="loading">Loading projects...</div>';

        // Try to load with orderBy, but fall back if index is missing
        let querySnapshot;
        try {
            const q = query(
                collection(db, 'projects'),
                orderBy('dueDate', 'desc')
            );
            querySnapshot = await getDocs(q);
        } catch (indexError) {
            // If index error, try without orderBy
            if (indexError.code === 'failed-precondition') {
                console.warn('Firestore index missing. Loading without sorting. Create an index for better performance.');
                const q = query(collection(db, 'projects'));
                querySnapshot = await getDocs(q);
                
                // Sort manually in JavaScript
                const projects = [];
                querySnapshot.forEach((doc) => {
                    projects.push({ id: doc.id, ...doc.data() });
                });
                projects.sort((a, b) => {
                    const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate || 0);
                    const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate || 0);
                    return dateB - dateA; // Descending order
                });
                
                if (projects.length === 0) {
                    projectsList.innerHTML = '<p>No projects available yet.</p>';
                    return;
                }
                
                projectsList.innerHTML = '';
                projects.forEach(project => {
                    createProjectCard(project, projectsList);
                });
                return;
            } else {
                throw indexError;
            }
        }
        
        if (querySnapshot.empty) {
            projectsList.innerHTML = '<p>No projects available yet.</p>';
            return;
        }

        projectsList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const project = { id: doc.id, ...doc.data() };
            createProjectCard(project, projectsList);
        });
    } catch (error) {
        console.error('Error loading projects:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        projectsList.innerHTML = `<p class="message error">Error loading projects: ${errorMessage}</p>`;
        showToast(`Error loading projects: ${errorMessage}`, 'error');
        
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        }
    }
}

// Create project card
function createProjectCard(project, container) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const dueDateFormatted = formatTimestamp(project.dueDate);
    const pastDue = isPastDue(project.dueDate);

    // Get teacher name
    getDoc(doc(db, 'users', project.teacherId)).then(teacherDoc => {
        const teacherName = teacherDoc.exists() ? teacherDoc.data().name : 'Unknown Teacher';
        
        card.innerHTML = `
            <h3>${project.title}</h3>
            <p>${project.description}</p>
            <div class="card-meta">
                <strong>Teacher:</strong> ${teacherName}<br>
                <strong>Due Date:</strong> ${dueDateFormatted} ${pastDue ? '<span style="color: var(--danger-color);">(Past Due)</span>' : ''}
            </div>
            <div class="card-actions">
                <button onclick="openSubmitModal('${project.id}')" class="btn btn-primary btn-small" ${pastDue ? 'disabled style="opacity: 0.5;"' : ''}>
                    ${pastDue ? 'Past Due' : 'Submit Project'}
                </button>
            </div>
        `;

        container.appendChild(card);
    }).catch(error => {
        console.error('Error loading teacher info:', error);
        card.innerHTML = `
            <h3>${project.title}</h3>
            <p>${project.description}</p>
            <div class="card-meta">
                <strong>Due Date:</strong> ${dueDateFormatted}
            </div>
            <div class="card-actions">
                <button onclick="openSubmitModal('${project.id}')" class="btn btn-primary btn-small">Submit Project</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Open submit modal
window.openSubmitModal = function(projectId) {
    currentProjectId = projectId;
    const modal = document.getElementById('submit-modal');
    if (modal) {
        modal.style.display = 'block';
        document.getElementById('project-link').value = '';
    }
};

// Handle submit
async function handleSubmit(e) {
    e.preventDefault();
    const link = document.getElementById('project-link').value;

    if (!link) {
        showToast('Please provide a project link', 'error');
        return;
    }

    if (!currentProjectId) {
        showToast('No project selected', 'error');
        return;
    }

    // Check if already submitted
    try {
        const q = query(
            collection(db, 'submissions'),
            where('projectId', '==', currentProjectId),
            where('studentId', '==', currentStudentId)
        );
        const existingSubmissions = await getDocs(q);
        
        if (!existingSubmissions.empty) {
            if (!confirm('You have already submitted for this project. Do you want to update your submission?')) {
                return;
            }
            // Update existing submission
            const submissionDoc = existingSubmissions.docs[0];
            await updateDoc(doc(db, 'submissions', submissionDoc.id), {
                link: link,
                timestamp: Timestamp.now(),
                updatedAt: new Date()
            });
            showToast('Submission updated successfully!', 'success');
        } else {
            // Create new submission
            await addDoc(collection(db, 'submissions'), {
                projectId: currentProjectId,
                studentId: currentStudentId,
                link: link,
                timestamp: Timestamp.now(),
                status: 'pending',
                createdAt: new Date()
            });
            showToast('Project submitted successfully!', 'success');
        }

        // Close modal
        const modal = document.getElementById('submit-modal');
        if (modal) modal.style.display = 'none';

        // Reload submissions
        loadSubmissions();
    } catch (error) {
        console.error('Error submitting project:', error);
        showToast('Error submitting project', 'error');
    }
}

// Load student's submissions
async function loadSubmissions() {
    const submissionsList = document.getElementById('submissions-list');
    if (!submissionsList) {
        console.error('Submissions list element not found');
        return;
    }

    if (!currentStudentId) {
        console.error('Current student ID not set');
        submissionsList.innerHTML = '<p class="message error">Student ID not found</p>';
        return;
    }

    try {
        submissionsList.innerHTML = '<div class="loading">Loading submissions...</div>';

        // Try to load with orderBy, but fall back if index is missing
        let querySnapshot;
        try {
            const q = query(
                collection(db, 'submissions'),
                where('studentId', '==', currentStudentId),
                orderBy('timestamp', 'desc')
            );
            querySnapshot = await getDocs(q);
        } catch (indexError) {
            // If index error, try without orderBy
            if (indexError.code === 'failed-precondition') {
                console.warn('Firestore index missing for submissions. Loading without sorting.');
                const q = query(
                    collection(db, 'submissions'),
                    where('studentId', '==', currentStudentId)
                );
                querySnapshot = await getDocs(q);
                
                // Sort manually in JavaScript
                const submissions = [];
                querySnapshot.forEach((doc) => {
                    submissions.push({ id: doc.id, ...doc.data() });
                });
                submissions.sort((a, b) => {
                    const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
                    const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
                    return dateB - dateA; // Descending order
                });
                
                if (submissions.length === 0) {
                    submissionsList.innerHTML = '<p>You haven\'t submitted any projects yet.</p>';
                    return;
                }
                
                submissionsList.innerHTML = '';
                for (const submission of submissions) {
                    await createSubmissionItem(submission, submissionsList);
                }
                return;
            } else {
                throw indexError;
            }
        }
        
        if (querySnapshot.empty) {
            submissionsList.innerHTML = '<p>You haven\'t submitted any projects yet.</p>';
            return;
        }

        submissionsList.innerHTML = '';
        
        for (const subDoc of querySnapshot.docs) {
            const submission = { id: subDoc.id, ...subDoc.data() };
            await createSubmissionItem(submission, submissionsList);
        }
    } catch (error) {
        console.error('Error loading submissions:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        submissionsList.innerHTML = `<p class="message error">Error loading submissions: ${errorMessage}</p>`;
        showToast(`Error loading submissions: ${errorMessage}`, 'error');
        
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        }
    }
}

// Helper function to create submission item
async function createSubmissionItem(submission, container) {
    try {
        // Get project info
        const projectDoc = await getDoc(doc(db, 'projects', submission.projectId));
        const projectTitle = projectDoc.exists() ? projectDoc.data().title : 'Unknown Project';

        const submissionItem = document.createElement('div');
        submissionItem.className = `submission-item ${submission.status || 'pending'}`;
        
        submissionItem.innerHTML = `
            <div class="submission-header">
                <h4>${projectTitle}</h4>
                <span class="status-badge ${submission.status || 'pending'}">${submission.status || 'Pending'}</span>
            </div>
            <p><strong>Your Submission:</strong> <a href="${submission.link}" target="_blank" class="submission-link">${submission.link}</a></p>
            <div class="submission-meta">
                <strong>Submitted:</strong> ${formatTimestamp(submission.timestamp)}
            </div>
            ${submission.feedback ? `<div class="submission-feedback"><strong>Teacher Feedback:</strong> ${submission.feedback}</div>` : '<div class="submission-feedback"><em>No feedback yet.</em></div>'}
        `;

        container.appendChild(submissionItem);
    } catch (error) {
        console.error('Error creating submission item:', error);
    }
}

// Setup modal
function setupModal() {
    const modal = document.getElementById('submit-modal');
    if (!modal) return;

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            currentProjectId = null;
        };
    }

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            currentProjectId = null;
        }
    };
}

