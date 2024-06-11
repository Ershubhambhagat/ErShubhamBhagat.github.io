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
                './image/1 room wide view.jpeg',
                './image/bathroom.png',
                './image/kitche_cleanup.jpeg',
                './image/LastRoom (3).jpeg',
                './image/LastRoom.jpeg',
                './image/Pnorma 3.jpeg',
                './image/Pnorma2.jpeg',
                './image/bathroom.png',
            ]
        },
        {
            id: 2,
            title: 'Room Near BOI Sangrampur,Munger ',
            size: '460 sq ft',
            amenities: '',
            location: 'Sangrampur,Munger',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [
                './image/bathroom.png',

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
            title: 'Room Near Bank Of India Sangrampur ',
            size: '460 sq ft',
            amenities: 'Not Furnished',
            location: 'Sangrampur,Munger',
            price: '$**/month',
            lat: 24.949925340658663,
            lng: 86.58923864364625,
            images: [
                './image/kitche_cleanup.jpeg',
                './image/TilesRoom.png  ',

                'https://dummyimage.com/300x200/000/fff&text=Kitchen',
                'https://dummyimage.com/300x200/000/fff&text=Bathroom'
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
});