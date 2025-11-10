// Submissions Page Functions for Teachers

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    updateDoc, 
    doc, 
    getDocs, 
    getDoc,
    query, 
    where,
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, formatTimestamp, escapeHtml } from './utils.js';

let currentUser = null;
let currentTeacherId = null;
let currentProjectId = null;
let currentProjectData = null;

// Initialize submissions page
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

        if (userRole !== 'teacher') {
            console.error('Access denied. User role is:', userRole);
            showToast('Access denied. Teacher access required.', 'error');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }

        currentTeacherId = user.uid;

        // Update UI
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = `Welcome, ${userData.name || user.email}`;

        // Get project ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        currentProjectId = urlParams.get('projectId');

        if (!currentProjectId) {
            showToast('No project specified. Redirecting to teacher dashboard.', 'error');
            setTimeout(() => {
                window.location.href = 'teacher.html';
            }, 2000);
            return;
        }

        // Load project and submissions
        await loadProject();
        await loadSubmissions();

        console.log('Submissions page initialized successfully');
    } catch (error) {
        console.error('Error initializing submissions page:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showToast(`Error loading page: ${errorMessage}`, 'error');
        
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

// Load project details
async function loadProject() {
    try {
        const projectDoc = await getDoc(doc(db, 'projects', currentProjectId));
        
        if (!projectDoc.exists()) {
            showToast('Project not found.', 'error');
            setTimeout(() => {
                window.location.href = 'teacher.html';
            }, 2000);
            return;
        }

        currentProjectData = { id: projectDoc.id, ...projectDoc.data() };

        // Update UI
        document.getElementById('project-title').textContent = currentProjectData.title;
        document.getElementById('project-description').textContent = currentProjectData.description;
        document.getElementById('project-due-date').textContent = formatTimestamp(currentProjectData.dueDate);
    } catch (error) {
        console.error('Error loading project:', error);
        showToast('Error loading project details', 'error');
    }
}

// Load submissions
async function loadSubmissions() {
    const submissionsList = document.getElementById('submissions-list');
    const submissionsSummary = document.getElementById('submissions-summary');
    
    if (!submissionsList || !submissionsSummary) {
        console.error('Submissions elements not found');
        return;
    }

    try {
        submissionsList.innerHTML = '<div class="loading">Loading submissions...</div>';
        submissionsSummary.innerHTML = '<div class="loading">Loading summary...</div>';

        // Get submissions for this project
        const baseQuery = query(
            collection(db, 'submissions'),
            where('projectId', '==', currentProjectId)
        );

        let submissions = [];

        try {
            // Try with orderBy first
            const orderedQuery = query(baseQuery, orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(orderedQuery);
            querySnapshot.forEach((subDoc) => {
                submissions.push({ id: subDoc.id, ...subDoc.data() });
            });
        } catch (indexError) {
            if (indexError.code === 'failed-precondition') {
                console.warn('Firestore index missing. Loading without sorting.');
                // Fall back to query without orderBy
                try {
                    const fallbackSnapshot = await getDocs(baseQuery);
                    fallbackSnapshot.forEach((subDoc) => {
                        submissions.push({ id: subDoc.id, ...subDoc.data() });
                    });
                    // Sort manually
                    submissions.sort((a, b) => {
                        const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
                        const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
                        return dateB - dateA;
                    });
                } catch (permissionError) {
                    if (permissionError.code === 'permission-denied') {
                        throw new Error('Permission denied. Teachers must be able to read submissions. Update Firestore security rules. See FIRESTORE_RULES.md for details.');
                    }
                    throw permissionError;
                }
            } else if (indexError.code === 'permission-denied') {
                throw new Error('Permission denied. Teachers must be able to read submissions. Update Firestore security rules. See FIRESTORE_RULES.md for details.');
            } else {
                throw indexError;
            }
        }

        // Update summary
        const totalSubmissions = submissions.length;
        const gradedCount = submissions.filter(s => (s.status || '').toLowerCase() === 'graded').length;
        const pendingCount = totalSubmissions - gradedCount;

        submissionsSummary.innerHTML = `
            <div class="summary-pill total">
                <span class="meta-label">Total Submissions</span>
                <span class="meta-value">${totalSubmissions}</span>
            </div>
            <div class="summary-pill graded">
                <span class="meta-label">Graded</span>
                <span class="meta-value">${gradedCount}</span>
            </div>
            <div class="summary-pill pending">
                <span class="meta-label">Pending</span>
                <span class="meta-value">${pendingCount}</span>
            </div>
        `;

        if (submissions.length === 0) {
            submissionsList.innerHTML = `
                <div class="empty-state">
                    <h3>No submissions yet</h3>
                    <p>Students have not submitted work for this project yet. Encourage them to submit before the deadline.</p>
                </div>
            `;
            return;
        }

        // Load student information and render submissions
        console.log(`Loading ${submissions.length} submissions...`);
        submissionsList.innerHTML = '';
        
        // Create a container for all submission cards
        const submissionsContainer = document.createElement('div');
        submissionsContainer.className = 'submissions-container';
        submissionsContainer.style.display = 'flex';
        submissionsContainer.style.flexDirection = 'column';
        submissionsContainer.style.gap = '16px';
        
        // Render each submission
        for (let i = 0; i < submissions.length; i++) {
            const submission = submissions[i];
            console.log(`Rendering submission ${i + 1}/${submissions.length}:`, submission);
            try {
                await renderSubmission(submission, submissionsContainer);
            } catch (renderError) {
                console.error(`Error rendering submission ${i + 1}:`, renderError);
                // Create error card for this submission
                const errorCard = document.createElement('div');
                errorCard.className = 'submission-card';
                errorCard.innerHTML = `
                    <div class="submission-card-header">
                        <h4>Error loading submission</h4>
                    </div>
                    <div class="submission-body">
                        <p class="message error">Could not load submission: ${renderError.message}</p>
                        <p><strong>Submission ID:</strong> ${submission.id}</p>
                        <p><strong>Student ID:</strong> ${submission.studentId || 'Unknown'}</p>
                    </div>
                `;
                submissionsContainer.appendChild(errorCard);
            }
        }
        
        // Append container to submissions list
        submissionsList.appendChild(submissionsContainer);
        
        console.log('All submissions rendered');
    } catch (error) {
        console.error('Error loading submissions:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        const errorMessage = error.message || 'Unknown error occurred';
        
        let errorHtml = `
            <div class="message error" style="padding: 20px; margin: 20px 0;">
                <h3 style="margin-bottom: 10px;">Error loading submissions</h3>
                <p style="margin-bottom: 15px;"><strong>${errorMessage}</strong></p>
        `;
        
        if (error.code === 'permission-denied') {
            errorHtml += `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 15px;">
                    <h4 style="margin-bottom: 10px; color: #856404;">🔒 Permission Denied - Fix Required</h4>
                    <p style="margin-bottom: 10px; color: #856404;">Your Firestore security rules don't allow teachers to read submissions.</p>
                    <p style="margin-bottom: 10px; color: #856404;"><strong>To fix this:</strong></p>
                    <ol style="text-align: left; display: inline-block; color: #856404;">
                        <li>Go to Firebase Console > Firestore Database > Rules</li>
                        <li>Update the submissions rule to: <code>allow read: if request.auth != null;</code></li>
                        <li>Click "Publish"</li>
                        <li>Wait a few seconds and refresh this page</li>
                    </ol>
                    <p style="margin-top: 15px; color: #856404;">See <strong>FIRESTORE_RULES.md</strong> in the project for complete rules.</p>
                </div>
            `;
        }
        
        errorHtml += `</div>`;
        
        submissionsList.innerHTML = errorHtml;
        showToast(`Error loading submissions: ${errorMessage}`, 'error');
        
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules. See FIRESTORE_RULES.md', 'error');
        }
    }
}

// Render a single submission
async function renderSubmission(submission, container) {
    console.log('renderSubmission called with:', submission);
    
    if (!submission || !submission.id) {
        console.error('Invalid submission data:', submission);
        throw new Error('Invalid submission data');
    }
    
    try {
        // Get student info
        console.log('Fetching student data for ID:', submission.studentId);
        let studentName = 'Unknown Student';
        let studentEmail = '';
        
        try {
            const studentDoc = await getDoc(doc(db, 'users', submission.studentId));
            if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                studentName = escapeHtml(studentData.name || 'Unknown Student');
                studentEmail = studentData.email ? escapeHtml(studentData.email) : '';
                console.log('Student data loaded:', { name: studentName, email: studentEmail });
            } else {
                console.warn('Student document not found for ID:', submission.studentId);
            }
        } catch (studentError) {
            console.error('Error loading student data:', studentError);
            // Continue with unknown student if we can't load student data
        }
        
        const status = (submission.status || 'pending').toLowerCase();
        const statusLabel = status === 'graded' ? 'Graded' : 'Pending';
        const submittedAt = submission.timestamp ? formatTimestamp(submission.timestamp) : 'No timestamp';
        const updatedAt = submission.updatedAt ? formatTimestamp(submission.updatedAt) : null;
        const submissionLink = submission.link ? escapeHtml(submission.link) : '';
        const feedbackValue = submission.feedback ? escapeHtml(submission.feedback) : '';
        
        console.log('Submission details:', {
            studentName,
            status,
            submittedAt,
            submissionLink: submissionLink ? 'Has link' : 'No link',
            feedback: feedbackValue ? 'Has feedback' : 'No feedback'
        });

        const submissionCard = document.createElement('div');
        submissionCard.className = `submission-card ${status}`;
        submissionCard.dataset.submissionId = submission.id;

        submissionCard.innerHTML = `
            <div class="submission-card-header">
                <div class="student-info">
                    <h4>${studentName}</h4>
                    ${studentEmail ? `<p class="submission-email">${studentEmail}</p>` : ''}
                </div>
                <span class="submission-status ${status}">${statusLabel}</span>
            </div>
            <div class="submission-body">
                <div class="submission-meta-grid">
                    <div class="meta-item">
                        <span class="meta-label">Submitted</span>
                        <span class="meta-value">${submittedAt}</span>
                    </div>
                    ${updatedAt ? `
                        <div class="meta-item">
                            <span class="meta-label">Last Updated</span>
                            <span class="meta-value">${updatedAt}</span>
                        </div>
                    ` : ''}
                    <div class="meta-item full-width">
                        <span class="meta-label">Submission Link</span>
                        ${submissionLink ? `
                            <div style="margin-top: 5px;">
                                <a href="${submissionLink}" target="_blank" rel="noopener noreferrer" class="submission-link" title="${submissionLink}">
                                    <strong>🔗 Open Submission</strong>
                                </a>
                                <br>
                                <small style="color: var(--text-light); word-break: break-all; display: block; margin-top: 5px;">${submissionLink}</small>
                            </div>
                        ` : '<span class="meta-value">No link provided</span>'}
                    </div>
                </div>
                <div class="submission-actions">
                    <label class="meta-label" for="feedback-${submission.id}">Teacher Feedback</label>
                    <textarea
                        id="feedback-${submission.id}"
                        class="submission-feedback-input"
                        placeholder="Add feedback for the student..."
                        rows="3"
                    >${feedbackValue}</textarea>
                    <div class="submission-controls">
                        <select id="status-${submission.id}" class="status-select">
                            <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="graded" ${status === 'graded' ? 'selected' : ''}>Graded</option>
                        </select>
                        <button
                            id="update-btn-${submission.id}"
                            onclick="updateSubmission('${submission.id}')"
                            class="btn btn-success"
                            type="button"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        console.log('Appending submission card to container');
        container.appendChild(submissionCard);
        console.log('Submission card appended successfully. Container now has', container.children.length, 'children');
    } catch (error) {
        console.error('Error in renderSubmission:', error);
        console.error('Error stack:', error.stack);
        // Re-throw error so calling code can handle it
        throw error;
    }
}

// Update submission
window.updateSubmission = async function(submissionId) {
    const feedbackInput = document.getElementById(`feedback-${submissionId}`);
    const statusSelect = document.getElementById(`status-${submissionId}`);
    const updateBtn = document.getElementById(`update-btn-${submissionId}`);

    if (!feedbackInput || !statusSelect || !updateBtn) {
        showToast('Error: Could not find submission form elements', 'error');
        return;
    }

    const feedback = feedbackInput.value.trim();
    const status = statusSelect.value;

    try {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Saving...';

        await updateDoc(doc(db, 'submissions', submissionId), {
            feedback: feedback,
            status: status,
            updatedAt: serverTimestamp()
        });

        showToast('Submission updated successfully!', 'success');
        updateBtn.disabled = false;
        updateBtn.textContent = 'Save Changes';

        // Update the card status
        const submissionCard = document.querySelector(`[data-submission-id="${submissionId}"]`);
        if (submissionCard) {
            submissionCard.className = `submission-card ${status}`;
            const statusBadge = submissionCard.querySelector('.submission-status');
            if (statusBadge) {
                statusBadge.textContent = status === 'graded' ? 'Graded' : 'Pending';
                statusBadge.className = `submission-status ${status}`;
            }
        }

        // Reload summary
        await loadSubmissions();
    } catch (error) {
        console.error('Error updating submission:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showToast(`Error updating submission: ${errorMessage}`, 'error');
        
        updateBtn.disabled = false;
        updateBtn.textContent = 'Save Changes';
        
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        }
    }
};

// Go back to teacher dashboard
window.goBack = function() {
    window.location.href = 'teacher.html';
};


