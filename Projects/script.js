const dummyData = [
  {
    title: "Your Project Title ",
    description: "Description of Project ",
    tags: ["Tag1", "Tag2"],
    slides: [  {type: "image", url: "../Blog/Image/1.gif"},
      { type: "image", url: "https://via.placeholder.com/300/ff0000" },
    { type: "image", url: "https://via.placeholder.com/300/" },
    {type: "video", url: 'https://youtu.be/oi64s4czHRg?si=GzsuFy1tlbyqTzUa'},
    {type: "image", url: "../Future/Image/AI Tools/AI (10).JPG"},
  ],
    source: "https://github.com/project1",
  }
];
document.addEventListener("DOMContentLoaded", loadProjects);
let currentSlideIndex = 0;
let slideInterval;
let url = 'https://ershubhambhagat.github.io/Projects/projects.json';
function loadProjects() {
  // fetch(projects.json)
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.length >= 1) {
        displayProjects(data);
      } else {
        displayProjects(dummyData);
      }
    })
    .catch(error => {
      if (error instanceof SyntaxError) {
        console.error("Invalid JSON:", error);
      } else {
        console.error("Error fetching projects:", error);
      }
      alert(error.message);
      displayProjects(dummyData);
    });
  }
function displayProjects(projects) {
  const projectContainer = document.getElementById("projectContainer");
  projects.forEach((project, index) => {
    const projectDiv = document.createElement("div");
    projectDiv.classList.add("project");
    const countTitleContainer = document.createElement("div");
    countTitleContainer.classList.add("projectCountTitleContainer");
    const countElement = document.createElement("p");
    countElement.classList.add("projectCount");
    countElement.textContent = index + 1;
    countTitleContainer.appendChild(countElement);
    // project-title
    const titleElement = document.createElement("p");
    titleElement.classList.add("project-title");
    titleElement.textContent = project.title;
    countTitleContainer.appendChild(titleElement);
    projectDiv.appendChild(countTitleContainer);
    const sliderContainer = document.createElement("div");
    sliderContainer.classList.add("slider-container");
    projectDiv.appendChild(sliderContainer);
    const slider = document.createElement("div");
    slider.classList.add("slider");
    sliderContainer.appendChild(slider);
    //readMoreButton
    const readMoreButton = document.createElement("button");
    readMoreButton.classList.add("readMoreButton");
    readMoreButton.textContent = "Description 🔽";
    readMoreButton.addEventListener("click", () =>
      toggleDescription(readMoreButton)
    );
    projectDiv.appendChild(readMoreButton);
    //project-description
    const descriptionElement = document.createElement("p");
    descriptionElement.classList.add("project-description");
    descriptionElement.textContent = project.description;
    const readMoreContainer = document.createElement("div");
    readMoreContainer.classList.add("readMoreContainer");
    readMoreContainer.appendChild(descriptionElement);
    projectDiv.appendChild(readMoreContainer);
    //slide
    project.slides.forEach((slide, slideIndex) => {
      const slideElement = document.createElement("div");
      slideElement.classList.add("slide");
      if (slide.type === "image") {
        const img = document.createElement("img");
        img.src = slide.url;
        slideElement.appendChild(img);
      } else if (slide.type === "video") {
        const iframe = document.createElement("iframe");
        iframe.src = slide.url;
        iframe.frameBorder = "0";
        iframe.allowFullScreen = true;
        slideElement.appendChild(iframe);
      }
      slider.appendChild(slideElement);
    });
    //slider-controls'
    const controls = document.createElement("div");
    controls.classList.add("slider-controls");
    sliderContainer.appendChild(controls);
    const prevButton = document.createElement("button");
    prevButton.classList.add("prev-button");
    prevButton.textContent = "<";
    prevButton.addEventListener("click", () => {
      currentSlideIndex =
        (currentSlideIndex - 1 + project.slides.length) % project.slides.length;
      updateSlide(slider, currentSlideIndex);
    });
    controls.appendChild(prevButton);
    const nextButton = document.createElement("button");
    nextButton.classList.add("next-button");
    nextButton.textContent = ">";
    nextButton.addEventListener("click", () => {
      currentSlideIndex = (currentSlideIndex + 1) % project.slides.length;
      updateSlide(slider, currentSlideIndex);
    });
    controls.appendChild(nextButton);
    // Auto-slide
    let slideInterval = 3000;
    function startSlideShow() {
      slideInterval = setInterval(() => {
        nextButton.click();
      }, slideInterval);
    }
    startSlideShow();
    //codeTags
    const tagsElement = document.createElement("p");
    tagsElement.classList.add("codeTags");
    tagsElement.textContent = `Tags: ${project.tags.join(", ")}`;
    projectDiv.appendChild(tagsElement);
    // source-button Code
    const sourceButton = document.createElement("button");
    sourceButton.classList.add("source-button");
    sourceButton.textContent = "Source";
    sourceButton.addEventListener("click", () => {
      window.open(project.source, "_blank");
    });
    projectDiv.appendChild(sourceButton);
    projectContainer.appendChild(projectDiv);
  });
  // Search functionality
  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase();
    const projectElements = projectContainer.children;
    for (let i = 0; i < projectElements.length; i++) {
      const projectElement = projectElements[i];
      const projectName = projectElement
        .querySelector(".project-title")
        .textContent.toLowerCase();
      const projectDescription = projectElement
        .querySelector(".project-description")
        .textContent.toLowerCase();
      const projectTags = projects[i].tags.join(", ").toLowerCase();
      if (
        projectName.includes(searchTerm) ||
        projectDescription.includes(searchTerm) ||
        projectTags.includes(searchTerm)
      ) {
        projectElement.style.display = "block";
      } else {
        projectElement.style.display = "none";
      }
    }
  });
}
//updateSlide
function updateSlide(slider, index) {
  const slides = slider.children;
  for (let i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  slides[index].style.display = "block";
}
function toggleDescription(button) {
  const readMoreContainer = button.parentElement.querySelector('.readMoreContainer');
    readMoreContainer.classList.toggle('expanded');
}
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}