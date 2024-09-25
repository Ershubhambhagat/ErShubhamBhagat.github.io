const projects = [
    {
        id: 1,
        date: "2023-01-01",
        tags: ["#IOT", "#NET", "#React"],
        title: "Project 1",
        description: "Short description of project 1",
        source: "https://example.com/project1",
        slides: ["https://via.placeholder.com/300", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://via.placeholder.com/300"]
    },
    {
        "id": 2,
        "date": "2023-01-01",
        "tags": ["#IOT", "#NET", "#React"],
        "title": "Project 1",
        "description": "Short description of project 1",
        "source": "https://example.com/project1",
        "slides": ["https://via.placeholder.com/300", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://via.placeholder.com/300"]
    },
    {
        "id": 3,
        "date": "2023-01-01",
        "tags": ["#IOT", "#NET", "#React"],
        "title": "Project 1",
        "description": "Short description of project 1",
        "source": "https://example.com/project1",
        "slides": ["https://via.placeholder.com/300", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://via.placeholder.com/300"]
    }
    // Add more projects as needed
];

document.addEventListener("DOMContentLoaded", function() {
    const cardContainer = document.getElementById("cardContainer");
    const searchBox = document.getElementById("searchBox");

    function createCard(project) {
        const card = document.createElement("div");
        card.classList.add("card");

        const cardNumber = document.createElement("div");
        cardNumber.classList.add("card-number");
        cardNumber.textContent = project.id;
        card.appendChild(cardNumber);

        const cardDate = document.createElement("div");
        cardDate.classList.add("card-date");
        cardDate.textContent = project.date;
        card.appendChild(cardDate);

        const cardTags = document.createElement("div");
        cardTags.classList.add("card-tags");
        cardTags.textContent = project.tags.join(" ");
        card.appendChild(cardTags);

        const slider = document.createElement("div");
        slider.classList.add("card-slider");
        project.slides.forEach(slide => {
            if (slide.includes("youtube")) {
                const iframe = document.createElement("iframe");
                iframe.src = slide;
                iframe.allow = "autoplay";
                slider.appendChild(iframe);
            } else {
                const img = document.createElement("img");
                img.src = slide;
                slider.appendChild(img);
            }
        });
        card.appendChild(slider);

        const title = document.createElement("div");
        title.classList.add("card-title");
        title.textContent = project.title;
        card.appendChild(title);

        const description = document.createElement("div");
        description.classList.add("card-description");
        description.textContent = project.description;
        card.appendChild(description);

        const source = document.createElement("div");
        source.classList.add("card-source");
        source.innerHTML = `<a href="${project.source}" target="_blank">Source</a>`;
        card.appendChild(source);

        return card;
    }

    function renderCards(filteredProjects) {
        cardContainer.innerHTML = "";
        filteredProjects.forEach(project => {
            const card = createCard(project);
            cardContainer.appendChild(card);
        });
    }

    function filterProjects(query) {
        return projects.filter(project => {
            const text = project.title + " " + project.description + " " + project.tags.join(" ");
            return text.toLowerCase().includes(query.toLowerCase());
        });
    }

    searchBox.addEventListener("input", () => {
        const query = searchBox.value;
        if (query.length >= 3) {
            const filteredProjects = filterProjects(query);
            renderCards(filteredProjects);
        } else {
            renderCards(projects);
        }
    });

    renderCards(projects);
});