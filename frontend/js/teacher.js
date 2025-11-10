// Teacher Dashboard Functions

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    getDoc,
    query, 
    where,
    orderBy,
    Timestamp,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { showToast, formatTimestamp, requireAuth, formatDateForInput } from './utils.js';

let currentUser = null;
let currentTeacherId = null;
let currentEditingProjectId = null;
let formSubmitHandler = null;

// Initialize teacher dashboard
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    try {
        currentUser = user;
        
        // Get user role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'teacher') {
            showToast('Access denied. Teacher access required.', 'error');
            window.location.href = 'dashboard.html';
            return;
        }

        currentTeacherId = user.uid;
        const userData = userDoc.data();

        // Update UI
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = `Welcome, ${userData.name || user.email}`;

        // Load projects
        loadProjects();

        // Setup form handler
        const projectForm = document.getElementById('project-form');
        if (projectForm) {
            // Set up create handler
            formSubmitHandler = handleFormSubmit;
            projectForm.addEventListener('submit', formSubmitHandler);
        }

        // Modal no longer needed - submissions open in separate page
    } catch (error) {
        console.error('Error initializing teacher dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
});

// Load projects
async function loadProjects() {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) return;

    try {
        projectsList.innerHTML = '<div class="loading">Loading projects...</div>';

        // Try to load with orderBy, but fall back to simple query if index is missing
        let querySnapshot;
        try {
            const q = query(
                collection(db, 'projects'),
                where('teacherId', '==', currentTeacherId),
                orderBy('dueDate', 'desc')
            );
            querySnapshot = await getDocs(q);
        } catch (indexError) {
            // If index error, try without orderBy
            if (indexError.code === 'failed-precondition') {
                console.warn('Firestore index missing. Loading without sorting. Create an index for better performance.');
                const q = query(
                    collection(db, 'projects'),
                    where('teacherId', '==', currentTeacherId)
                );
                querySnapshot = await getDocs(q);
                // Sort manually in JavaScript
                const projects = [];
                querySnapshot.forEach((doc) => {
                    projects.push({ id: doc.id, ...doc.data() });
                });
                projects.sort((a, b) => {
                    const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
                    const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
                    return dateB - dateA; // Descending order
                });
                
                if (projects.length === 0) {
                    projectsList.innerHTML = '<p>No projects yet. Create your first project!</p>';
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
            projectsList.innerHTML = '<p>No projects yet. Create your first project!</p>';
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
    }
}

// Create project card
function createProjectCard(project, container) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const isPastDue = project.dueDate?.toDate() < new Date();
    const dueDateFormatted = formatTimestamp(project.dueDate);

    card.innerHTML = `
        <h3>${project.title}</h3>
        <p>${project.description}</p>
        <div class="card-meta">
            <strong>Due Date:</strong> ${dueDateFormatted} ${isPastDue ? '<span style="color: var(--danger-color);">(Past Due)</span>' : ''}
        </div>
        <div class="card-actions">
            <button onclick="viewSubmissions('${project.id}')" class="btn btn-primary btn-small">View Submissions</button>
            <button onclick="editProject('${project.id}')" class="btn btn-secondary btn-small">Edit</button>
            <button onclick="deleteProject('${project.id}')" class="btn btn-danger btn-small">Delete</button>
        </div>
    `;

    container.appendChild(card);
}

// Handle form submit (routes to create or update)
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (currentEditingProjectId) {
        await updateProject(currentEditingProjectId);
    } else {
        await handleCreateProject();
    }
}

// Handle create project
async function handleCreateProject() {
    const title = document.getElementById('project-title').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const dueDate = document.getElementById('project-due-date').value;

    if (!title || !description || !dueDate) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    if (!currentTeacherId) {
        showToast('Teacher ID not found. Please log in again.', 'error');
        return;
    }

    try {
        const submitBtn = document.getElementById('submit-project-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        // Convert datetime-local value to Firestore Timestamp
        const dueDateObj = new Date(dueDate);
        if (isNaN(dueDateObj.getTime())) {
            throw new Error('Invalid date format');
        }

        // Create project with Firestore Timestamp
        await addDoc(collection(db, 'projects'), {
            title: title,
            description: description,
            dueDate: Timestamp.fromDate(dueDateObj),
            teacherId: currentTeacherId,
            createdAt: serverTimestamp()
        });

        showToast('Project created successfully!', 'success');
        document.getElementById('project-form').reset();
        await loadProjects();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Project';
    } catch (error) {
        console.error('Error creating project:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showToast(`Error creating project: ${errorMessage}`, 'error');
        
        // Check if it's a permission error
        if (error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        } else if (error.code === 'unauthenticated') {
            showToast('You must be logged in to create projects.', 'error');
        }
        
        const submitBtn = document.getElementById('submit-project-btn');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Project';
    }
}

// View submissions - redirect to submissions page
window.viewSubmissions = function(projectId) {
    // Redirect to submissions page with project ID
    window.location.href = `submissions.html?projectId=${projectId}`;
};

// Edit project
window.editProject = async function(projectId) {
    try {
        const projectDoc = await getDoc(doc(db, 'projects', projectId));
        if (!projectDoc.exists()) {
            showToast('Project not found', 'error');
            return;
        }

        const project = projectDoc.data();
        
        // Fill form with project data
        document.getElementById('project-title').value = project.title;
        document.getElementById('project-description').value = project.description;
        document.getElementById('project-due-date').value = formatDateForInput(project.dueDate);

        // Change form to update mode
        currentEditingProjectId = projectId;
        const submitBtn = document.getElementById('submit-project-btn');
        submitBtn.textContent = 'Update Project';
        submitBtn.dataset.projectId = projectId;

        // Scroll to form
        const form = document.getElementById('project-form');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error loading project:', error);
        showToast('Error loading project', 'error');
    }
};

// Update project
async function updateProject(projectId) {
    const title = document.getElementById('project-title').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const dueDate = document.getElementById('project-due-date').value;

    if (!title || !description || !dueDate) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    try {
        // Convert datetime-local value to Firestore Timestamp
        const dueDateObj = new Date(dueDate);
        if (isNaN(dueDateObj.getTime())) {
            throw new Error('Invalid date format');
        }

        await updateDoc(doc(db, 'projects', projectId), {
            title: title,
            description: description,
            dueDate: Timestamp.fromDate(dueDateObj),
            updatedAt: serverTimestamp()
        });

        showToast('Project updated successfully!', 'success');
        
        // Reset form and exit update mode
        currentEditingProjectId = null;
        const form = document.getElementById('project-form');
        const submitBtn = document.getElementById('submit-project-btn');
        form.reset();
        submitBtn.textContent = 'Create Project';
        submitBtn.removeAttribute('data-project-id');

        await loadProjects();
    } catch (error) {
        console.error('Error updating project:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        showToast(`Error updating project: ${errorMessage}`, 'error');
        
        // Check error codes
        if (error.code === 'permission-denied' || error.code === 'permission-denied') {
            showToast('Permission denied. Check Firestore security rules.', 'error');
        } else if (error.code === 'unauthenticated') {
            showToast('You must be logged in to update projects.', 'error');
        }
    }
}

// Delete project
window.deleteProject = async function(projectId) {
    if (!confirm('Are you sure you want to delete this project? This will also delete all submissions.')) {
        return;
    }

    try {
        // Delete all submissions for this project
        const q = query(
            collection(db, 'submissions'),
            where('projectId', '==', projectId)
        );
        const submissionsSnapshot = await getDocs(q);
        submissionsSnapshot.forEach(async (subDoc) => {
            await deleteDoc(doc(db, 'submissions', subDoc.id));
        });

        // Delete project
        await deleteDoc(doc(db, 'projects', projectId));
        showToast('Project deleted successfully!', 'success');
        loadProjects();
    } catch (error) {
        console.error('Error deleting project:', error);
        showToast('Error deleting project', 'error');
    }
};


