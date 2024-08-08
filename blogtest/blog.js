// Fetch blogs from Firebase
function fetchBlogs() {
    db.collection('blogs').get().then(snapshot => {
        const blogs = snapshot.docs.map(doc => doc.data());
        renderBlogCards(blogs);
    }).catch(error => {
        console.error("Error fetching documents: ", error);
    });
}

// Function to create a blog card
function createBlogCard(blog) {
    const card = document.createElement('div');
    card.classList.add('blog-card');

    // Image Slider
    const swiperContainer = document.createElement('div');
    swiperContainer.classList.add('swiper-container');
    const swiperWrapper = document.createElement('div');
    swiperWrapper.classList.add('swiper-wrapper');

    blog.images.forEach(image => {
        const swiperSlide = document.createElement('div');
        swiperSlide.classList.add('swiper-slide');
        const img = document.createElement('img');
        img.src = image;
        swiperSlide.appendChild(img);
        swiperWrapper.appendChild(swiperSlide);
    });

    swiperContainer.appendChild(swiperWrapper);
    card.appendChild(swiperContainer);

    // Tags
    const tagsContainer = document.createElement('div');
    tagsContainer.classList.add('tags');
    blog.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = tag;
        tagsContainer.appendChild(tagSpan);
    });
    card.appendChild(tagsContainer);

    // Short Description
    const shortDescription = document.createElement('div');
    shortDescription.classList.add('short-description');
    shortDescription.textContent = blog.shortDescription;
    card.appendChild(shortDescription);

    // Date and Number
    const dateNumber = document.createElement('div');
    dateNumber.classList.add('date-number');
    dateNumber.textContent = `${blog.date} - ${blog.number}`;
    card.appendChild(dateNumber);

    // Long Description
    const longDescription = document.createElement('div');
    longDescription.classList.add('long-description');
    longDescription.textContent = blog.longDescription;
    card.appendChild(longDescription);

    // Read More Button
    const readMoreButton = document.createElement('button');
    readMoreButton.classList.add('read-more');
    readMoreButton.textContent = 'Read More';
    readMoreButton.addEventListener('click', () => {
        longDescription.style.display = longDescription.style.display === 'none' ? 'block' : 'none';
    });
    card.appendChild(readMoreButton);

    // Full Article Button
    const fullArticleButton = document.createElement('button');
    fullArticleButton.classList.add('full-article');
    fullArticleButton.textContent = 'Read Full Article';
    fullArticleButton.addEventListener('click', () => {
        window.location.href = blog.fullArticleUrl;
    });
    card.appendChild(fullArticleButton);

    return card;
}

// Function to render blog cards
function renderBlogCards(blogs) {
    const container = document.getElementById('blogCardsContainer');
    container.innerHTML = '';
    blogs.forEach(blog => {
        const card = createBlogCard(blog);
        container.appendChild(card);
    });

    // Initialize Swiper
    new Swiper('.swiper-container', {
        loop: true,
        autoplay: {
            delay: 3000,
        },
    });
}

// Search functionality
document.getElementById('searchButton').addEventListener('click', () => {
    const query = document.getElementById('searchBox').value.toLowerCase();
    db.collection('blogs').get().then(snapshot => {
        const blogs = snapshot.docs.map(doc => doc.data());
        const filteredBlogs = blogs.filter(blog => blog.title.toLowerCase().includes(query));
        renderBlogCards(filteredBlogs);
    }).catch(error => {
        console.error("Error fetching documents: ", error);
    });
});

// Initial fetch of blogs
fetchBlogs();
