document.addEventListener("DOMContentLoaded", () => {
  const database = firebase.database();
  const dbRef = database.ref("blogs");
  function fetchBlogs() {
    dbRef
      .once("value")
      .then((snapshot) => {
        if (snapshot.exists()) {
          const blogs = snapshot.val();
          const blogsArray = Object.values(blogs);
          renderBlogCards(blogsArray);
        } else {
          console.log("No blogs available");
        }
      })
      .catch((error) => {
        console.error("Error fetching blogs: ", error);
      });
  }
  function createBlogCard(blog) {
    const card = document.createElement("div");
    card.classList.add("blog-card");
    // Number
    const number = document.createElement("div");
    number.classList.add("number");
    number.textContent = blog.number || "";
    card.appendChild(number);
    // Title
    const title = document.createElement("div");
    title.classList.add("title");
    title.textContent = blog.title || "";
    card.appendChild(title);
    // Date
    const date = document.createElement("div");
    date.classList.add("date");
    date.textContent = "Date: " + (blog.date || "");
    card.appendChild(date);
    // Image
    if (blog.images) {
      const swiperContainer = document.createElement("div");
      swiperContainer.classList.add("swiper-container");
      const swiperWrapper = document.createElement("div");
      swiperWrapper.classList.add("swiper-wrapper");
      blog.images.forEach((image) => {
        const swiperSlide = document.createElement("div");
        swiperSlide.classList.add("swiper-slide");
        const img = document.createElement("img");
        img.src = image;
        img.style.height = "200px";
        img.style.objectFit = "contain";
        swiperSlide.appendChild(img);
        swiperWrapper.appendChild(swiperSlide);
      });
      swiperContainer.appendChild(swiperWrapper);
      card.appendChild(swiperContainer);
    }
    // Tags
    const tagsContainer = document.createElement("div");
    tagsContainer.textContent = "Tags: ";
    tagsContainer.classList.add("tags");
    if (blog.tags) {
      blog.tags.forEach((tag) => {
        const tagSpan = document.createElement("span");
        tagSpan.textContent = tag + " ";
        tagsContainer.appendChild(tagSpan);
      });
    }
    card.appendChild(tagsContainer);
    // Long Description
    const longDescription = document.createElement("div");
    longDescription.classList.add("long-description");
    longDescription.textContent = blog.longDescription || "";
    // Website Link
    const websiteLink = document.createElement("button");
    websiteLink.classList.add("full-article");
    websiteLink.textContent = "Website Link";
    websiteLink.addEventListener("click", () => {
      window.location.href = blog.websiteLink;
    });
    card.appendChild(websiteLink);
    // Read More
    const readMoreButton = document.createElement("button");
    readMoreButton.classList.add("read-more");
    readMoreButton.textContent = "Read More";
    readMoreButton.addEventListener("click", () => {
      longDescription.style.display =
        longDescription.style.display === "block" ? "none" : "block";
    });
    card.appendChild(readMoreButton);
    card.appendChild(longDescription);

    return card;
  }
  function renderBlogCards(blogs) {
    const container = document.getElementById("blogCardsContainer");
    container.innerHTML = "";
    blogs.forEach((blog) => {
      const card = createBlogCard(blog);
      container.appendChild(card);
    });
    // Initialize Swiper for each card
    blogs.forEach((blog, index) => {
      const swiperContainer =
        document.querySelectorAll(".swiper-container")[index];
      const slideCount = blog.images ? blog.images.length : 0;
      new Swiper(swiperContainer, {
        loop: slideCount > 1,
        autoplay: {
          delay: 3000,
        },
        slidesPerView: 1,
        slidesPerGroup: 1,
      });
    });
  }
  // Search functionality// Cut button functionality
  document.getElementById("cutButton").addEventListener("click", () => {
    const searchBox = document.getElementById("searchBox");
    searchBox.style.display = "none"; // Hide the search box
    document.getElementById("cutButton").style.display = "none"; // Hide the cut button
  });
  // Search functionality
  const searchBox = document.getElementById("searchBox");
  searchBox.addEventListener("input", () => {
    const query = searchBox.value.toLowerCase();
    dbRef
      .once("value")
      .then((snapshot) => {
        if (snapshot.exists()) {
          const blogs = snapshot.val();
          const filteredBlogs = Object.values(blogs).filter(
            (blog) =>
              blog.title.toLowerCase().includes(query) ||
              (blog.tags &&
                blog.tags.some((tag) => tag.toLowerCase().includes(query))) ||
              blog.longDescription.toLowerCase().includes(query)
          );
          renderBlogCards(filteredBlogs);
        }
      })
      .catch((error) => {
        console.error("Error fetching blogs: ", error);
      });
  });
  fetchBlogs();
});
