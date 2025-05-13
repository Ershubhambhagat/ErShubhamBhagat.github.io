document.addEventListener('DOMContentLoaded', function() {
    // Dummy Property Data
    const properties = [
        {
            id: 1,
            title: 'Room Near Bank Of India Sangrampur ',
            size: '460 sq ft',
            amenities: 'Not Furnished',
            location: 'Sangrampur',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [
                './image/1 room.jpeg',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=1 RooM',

                './image/1 room wide view.jpeg',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=Bathroom',

                './image/bathroom.png',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=Kitchen',

                './image/kitche_cleanup.jpeg',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=2nd Room',

                './image/LastRoom (3).jpeg',
                './image/LastRoom.jpeg',
                './image/Pnorma 3.jpeg',
                './image/Pnorma2.jpeg',
                './image/bathroom.png',
            ],
            images: [
                './image/1 room.jpeg',
                './image/1 room wide view.jpeg',

                './image/bathroom.png',
                './image/kitche_cleanup.jpeg',

                './image/LastRoom (3).jpeg',
                './image/LastRoom.jpeg',
                './image/Pnorma 3.jpeg',
                './image/1 room wide view.jpeg',
                './image/bathroom.png',
                './image/kitche_cleanup.jpeg',
                './image/1 room.jpeg',
                './image/1 room wide view.jpeg',

                './image/Pnorma2.jpeg',
                './image/bathroom.png',
            ]
        },
        {
            id: 2,
            title: 'Room Near HDFC Bank Sangrampur,Munger ',
            size: '100 sq ft',
            amenities: '',
            location: 'Sangrampur,Munger',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [
                './image/SingleTilesSmallRoom.jpeg',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=1st Room',

                './image/2SingleTilesSmallRoom.jpeg',
                'https://dummyimage.com/300x400/ffffff/000000.png&text=Bathroom',

                './image/bathroom.png',
                'https://dummyimage.com/300x400/ffffff/000000.png&text= Room',


                './image/SingleTilesSmallRoom.jpeg',
                './image/SingleTilesSmallRoom.jpeg',
                './image/SingleTilesSmallRoom.jpeg',


            ],
        },
       {
            id: 3,
            title: 'video Near Bank Of India Sangrampur ',
            size: '460 sq ft',
            amenities: 'Not Furnished',
            location: 'Sangrampur,Munger',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [
                'https://dummyimage.com/300x400/ffffff/000000.png&text=Kitchen',

                './image/Video.mp4',
                './image/TilesRoom.png  ',

                'https://dummyimage.com/300x400/ffffff/000000.png&text=Bathroom',

            ]
        },
        {
            id: 4,
            title: 'Sangrampur ',
            size: '460 sq ft',
            amenities: 'Not Furnished',
            location: 'Sangrampur',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [

                './image/LastRoom (3).jpeg',
                './image/LastRoom.jpeg',
                './image/Pnorma 3.jpeg',
                './image/1 room wide view.jpeg',
                './image/bathroom.png',
                './image/kitche_cleanup.jpeg',
                './image/1 room.jpeg',

                './image/Pnorma2.jpeg',
                './image/bathroom.png',
            ]
        },



    ];

    // Populate property listings
    const propertyList = document.getElementById('property-list');
    propertyList.innerHTML = '';

    properties.forEach(property => {
        const propertyCard = `
            <div class="col-md-4 mb-4">
                <div class="card">
                    <div id="carousel${property.id}" class="carousel slide" data-ride="carousel">
                        <div class="carousel-inner">
                            ${property.images.map((img, index) => `
                                <div class="carousel-item ${index === 0 ? 'active' : ''}">
                                    <img src="${img}" class="d-block w-100" alt="Property Image">
                                </div>
                            `).join('')}
                        </div>
                        <a class="carousel-control-prev" href="#carousel${property.id}" role="button" data-slide="prev">
                            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                            <span class="sr-only">Previous</span>
                        </a>
                        <a class="carousel-control-next" href="#carousel${property.id}" role="button" data-slide="next">
                            <span class="carousel-control-next-icon" aria-hidden="true"></span>
                            <span class="sr-only">Next</span>
                        </a>
                    </div>
                    <div class="card-body">
                        <h5 class="card-title">${property.title}</h5>
                        <p class="card-text">Room size: ${property.size} | Amenities: ${property.amenities}</p>
                        <p class="card-text">Location: ${property.location}</p>
                        <p class="card-text">Price: ${property.price}</p>
                        <a class="btn btn-primary" data-toggle="collapse" href="#details${property.id}" role="button" aria-expanded="false" aria-controls="details${property.id}">View Details</a>
                        <div class="collapse mt-3" id="details${property.id}">
                            <div class="card card-body">
                                <p>Distance from Bus Stand: 500m</p>
                                <a href="https://www.google.com/maps/dir/?api=1&destination=${property.lat},${property.lng}" target="_blank" class="btn btn-info">Navigate Room</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        propertyList.innerHTML += propertyCard;
    });

    // Initialize Google Map
    window.initMap = function() {
        const map = new google.maps.Map(document.getElementById("map-canvas"), {
            center: { lat: -34.397, lng: 150.644 },
            zoom: 8,
        });

        properties.forEach(property => {
            const marker = new google.maps.Marker({
                position: { lat: property.lat, lng: property.lng },
                map: map,
                title: property.title
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<h5>${property.title}</h5><p>${property.location}</p>`
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
        });
    };

    // Load Google Maps script dynamically
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&callback=initMap`;
    script.async = true;
    document.head.appendChild(script);

    // Search Functionality
    const searchButton = document.getElementById('button-search');
    const searchInput = document.getElementById('search-input');

    searchButton.addEventListener('click', function() {
        const query = searchInput.value.toLowerCase();
        const filteredProperties = properties.filter(property => property.title.toLowerCase().includes(query) || property.location.toLowerCase().includes(query));

        propertyList.innerHTML = '';

        if (filteredProperties.length > 0) {
            filteredProperties.forEach(property => {
                const propertyCard = `
                    <div class="col-md-4 mb-4">
                        <div class="card">
                            <div id="carousel${property.id}" class="carousel slide" data-ride="carousel">
                                <div class="carousel-inner">
                                    ${property.images.map((img, index) => `
                                        <div class="carousel-item ${index === 0 ? 'active' : ''}">
                                            <img src="${img}" class="d-block w-100" alt="Property Image">
                                        </div>
                                    `).join('')}
                                </div>
                                <a class="carousel-control-prev" href="#carousel${property.id}" role="button" data-slide="prev">
                                    <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                                    <span class="sr-only">Previous</span>
                                </a>
                                <a class="carousel-control-next" href="#carousel${property.id}" role="button" data-slide="next">
                                    <span class="carousel-control-next-icon" aria-hidden="true"></span>
                                    <span class="sr-only">Next</span>
                                </a>
                            </div>
                            <div class="card-body">
                                <h5 class="card-title">${property.title}</h5>
                                <p class="card-text">Room size: ${property.size} | Amenities: ${property.amenities}</p>
                                <p class="card-text">Location: ${property.location}</p>
                                <p class="card-text">Price: ${property.price}</p>
                                <a class="btn btn-primary" data-toggle="collapse" href="#details${property.id}" role="button" aria-expanded="false" aria-controls="details${property.id}">View Details</a>
                                <div class="collapse mt-3" id="details${property.id}">
                                    <div class="card card-body">
                                        <p>Distance from Bus Stand: 500m</p>
                                        <a href="https://www.google.com/maps/dir/?api=1&destination=${property.lat},${property.lng}" target="_blank" class="btn btn-info">Navigate to Bus Stand</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                propertyList.innerHTML += propertyCard;
            });
        } else {
            propertyList.innerHTML = '<p>No properties found.</p>';
        }
    });

//   // Clear search input on focus


document.addEventListener('DOMContentLoaded', () => {
    const background = document.querySelector('.dynamic-background');
    const floatingDotsContainer = document.createElement('div');
    floatingDotsContainer.classList.add('floating-dots');
    background.appendChild(floatingDotsContainer);

    const colors = [
        'rgba(255, 255, 0, 0.8)',   // Yellow
        'rgba(255, 0, 0, 0.8)',     // Red
        'rgba(0, 255, 255, 0.8)',   // Cyan
        'rgba(0, 255, 0, 0.8)',     // Green
        'rgba(255, 165, 0, 0.8)',   // Orange
        'rgba(128, 0, 128, 0.8)',   // Purple
        'rgba(0, 0, 255, 0.8)',     // Blue
        'rgba(255, 20, 147, 0.8)',  // Deep Pink
        'rgba(75, 0, 130, 0.8)',    // Indigo
        'rgba(255, 105, 180, 0.8)', // Hot Pink
        'rgba(0, 128, 128, 0.8)',   // Teal
        'rgba(255, 69, 0, 0.8)',    // Red-Orange
        'rgba(173, 216, 230, 0.8)', // Light Blue
        'rgba(34, 139, 34, 0.8)',   // Forest Green
        'rgba(255, 223, 0, 0.8)',   // Golden Yellow
        'rgba(0, 0, 139, 0.8)',     // Dark Blue
        'rgba(139, 0, 0, 0.8)',     // Dark Red
        'rgba(255, 182, 193, 0.8)', // Light Pink
        'rgba(0, 191, 255, 0.8)',   // Deep Sky Blue
        'rgba(46, 139, 87, 0.8)',   // Sea Green
        'rgba(240, 230, 140, 0.8)', // Khaki
        'rgba(128, 128, 0, 0.8)',   // Olive
        'rgba(72, 61, 139, 0.8)',   // Dark Slate Blue
        'rgba(0, 100, 0, 0.8)',     // Dark Green
        'rgba(255, 140, 0, 0.8)',   // Dark Orange
        'rgba(220, 20, 60, 0.8)',   // Crimson
        'rgba(0, 206, 209, 0.8)',   // Dark Turquoise
        'rgba(186, 85, 211, 0.8)',  // Medium Orchid
        'rgba(147, 112, 219, 0.8)', // Medium Purple
        'rgba(255, 248, 220, 0.8)'  // Cornsilk
    ];
    // Increase the number of dots
    const totalDots = 2000; // Change this number to increase or decrease dots
    for (let i = 0; i < totalDots; i++) {
        const dot = document.createElement('span');
        dot.style.background = colors[Math.floor(Math.random() * colors.length)]; // Random color
        dot.style.top = `${Math.random() * 100}vh`; // Random vertical position
        dot.style.left = `${Math.random() * 100}vw`; // Random horizontal position
        dot.style.animationDelay = `${Math.random() * 5}s`; // Random animation delay
        floatingDotsContainer.appendChild(dot);
    }
});



    // Dynamic Background with Floating Dots
    const background = document.querySelector('.dynamic-background');
    const floatingDotsContainer = document.createElement('div');
    floatingDotsContainer.classList.add('floating-dots');
    background.appendChild(floatingDotsContainer);

    const colors = [
        'rgba(255, 255, 0, 0.8)',   // Yellow
        'rgba(255, 0, 0, 0.8)',     // Red
        'rgba(0, 255, 255, 0.8)',   // Cyan
        'rgba(0, 255, 0, 0.8)',     // Green
        'rgba(255, 165, 0, 0.8)',   // Orange
        'rgba(128, 0, 128, 0.8)',   // Purple
        'rgba(0, 0, 255, 0.8)',     // Blue
        'rgba(255, 20, 147, 0.8)',  // Deep Pink
        'rgba(75, 0, 130, 0.8)',    // Indigo
        'rgba(255, 105, 180, 0.8)', // Hot Pink
        'rgba(0, 128, 128, 0.8)',   // Teal
        'rgba(255, 69, 0, 0.8)',    // Red-Orange
        'rgba(173, 216, 230, 0.8)', // Light Blue
        'rgba(34, 139, 34, 0.8)',   // Forest Green
        'rgba(255, 223, 0, 0.8)',   // Golden Yellow
        'rgba(0, 0, 139, 0.8)',     // Dark Blue
        'rgba(139, 0, 0, 0.8)',     // Dark Red
        'rgba(255, 182, 193, 0.8)', // Light Pink
        'rgba(0, 191, 255, 0.8)',   // Deep Sky Blue
        'rgba(46, 139, 87, 0.8)',   // Sea Green
        'rgba(240, 230, 140, 0.8)', // Khaki
        'rgba(128, 128, 0, 0.8)',   // Olive
        'rgba(72, 61, 139, 0.8)',   // Dark Slate Blue
        'rgba(0, 100, 0, 0.8)',     // Dark Green
        'rgba(255, 140, 0, 0.8)',   // Dark Orange
        'rgba(220, 20, 60, 0.8)',   // Crimson
        'rgba(0, 206, 209, 0.8)',   // Dark Turquoise
        'rgba(186, 85, 211, 0.8)',  // Medium Orchid
        'rgba(147, 112, 219, 0.8)', // Medium Purple
        'rgba(255, 248, 220, 0.8)'  // Cornsilk
    ];

    // Create many floating dots
    const totalDots = 20; // Number of dots
    const dots = [];
    for (let i = 0; i < totalDots; i++) {
        const dot = document.createElement('span');
        dot.style.background = colors[Math.floor(Math.random() * colors.length)]; // Random color
        dot.style.top = `${Math.random() * 100}vh`; // Random vertical position
        dot.style.left = `${Math.random() * 100}vw`; // Random horizontal position
        dot.style.animationDelay = `${Math.random() * 1}s`; // Random animation delay
        floatingDotsContainer.appendChild(dot);
        dots.push(dot);
    }

    // Mouse tracking effect
    document.addEventListener('mousemove', (e) => {
        dots.forEach((dot, index) => {
            const delay = index * 50; // Staggered delay for each dot
            setTimeout(() => {
                dot.style.top = `${e.clientY + Math.random() * 20 - 10}px`; // Add slight randomness
                dot.style.left = `${e.clientX + Math.random() * 20 - 10}px`; // Add slight randomness
            }, delay);
        });
    });
});