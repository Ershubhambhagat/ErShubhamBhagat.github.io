// Fetch JSON data
async function fetchProjects() {
    const response = await fetch('projects.json');
    const data = await response.json();
    return data;
}

// Create project cards
function createProjectCard(project) {
    const card = document.createElement('div');
    card.classList.add('project-card');

    const header = document.createElement('div');
    header.classList.add('card-header');

    const cardNumber = document.createElement('span');
    cardNumber.classList.add('card-number');
    cardNumber.textContent = project.id;
    header.appendChild(cardNumber);

    const cardDate = document.createElement('span');
    cardDate.classList.add('card-date');
    cardDate.textContent = project.date;
    header.appendChild(cardDate);

    const cardTags = document.createElement('span');
    cardTags.classList.add('card-tags');
    project.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = tag;
        cardTags.appendChild(tagSpan);
    });
    header.appendChild(cardTags);

    card.appendChild(header);

    const body = document.createElement('div');
    body.classList.add('card-body');

    const slider = document.createElement('div');
    slider.classList.add('slider');

    let currentSlide = 0;
    project.slides.forEach((slide, index) => {
        const slideDiv = document.createElement('div');
        slideDiv.classList.add('slide');
        if (index === 0) {
            slideDiv.classList.add('active');
        }

        if (slide.type === 'image') {
            const img = document.createElement('img');
            img.src = slide.url;
            slideDiv.appendChild(img);
        } else if (slide.type === 'video') {
            const iframe = document.createElement('iframe');
            iframe.src = slide.url;
            iframe.frameBorder = "0";
            iframe.allowFullScreen = true;
            slideDiv.appendChild(iframe);
        }

        slider.appendChild(slideDiv);
    });

    body.appendChild(slider);

    // Auto slide
    setInterval(() => {
        const slides = slider.children;
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 1000);

    card.appendChild(body);

    const footer = document.createElement('div');
    footer.classList.add('card-footer');

    const title = document.createElement('h3');
    title.textContent = project.title;
    footer.appendChild(title);

    const description = document.createElement('p');
    description.textContent = project.description;
    footer.appendChild(description);

    const sourceLink = document.createElement('a');
    sourceLink.href = project.source;
    sourceLink.classList.add('source-link');
    sourceLink.textContent = 'View Source';
    footer.appendChild(sourceLink);

    card.appendChild(footer);

    return card;
}

// Display projects
async function displayProjects() {
    const projects = await fetchProjects();
    const projectCardsContainer = document.getElementById('projectCards');

    projects.forEach(project => {
        const card = createProjectCard(project);
        projectCardsContainer.appendChild(card);
    });
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchQuery = e.target.value.toLowerCase();
    const projectCards = document.querySelectorAll('.project-card');

    projectCards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        const description = card.querySelector('p').textContent.toLowerCase();
        const tags = Array.from(card.querySelectorAll('.card-tags span')).map(tag => tag.textContent.toLowerCase());

        if (title.includes(searchQuery) || description.includes(searchQuery) || tags.some(tag => tag.includes(searchQuery))) {
            card.style.display = 'inline-block';
        } else {
            card.style.display = 'none';
        }
    });
});

displayProjects();