
document.addEventListener("DOMContentLoaded", function () {
   fetch("https://ershubhambhagat.github.io//Future/SS/JSON/ss.json") // Replace with the path to your JSON file
       .then(response => response.json())
       .then(data => {
           const gallery = document.getElementById("gallery");

           data.forEach(entry => {
               // Create HTML elements to display image, title, and tag
               const img = document.createElement("img");
               img.src = entry.imageURL;

               const title = document.createElement("h2");
               title.textContent = entry.title;

               const tag = document.createElement("p");
               tag.textContent = `Tag: ${entry.tag}`;

               // Append elements to the gallery
               gallery.appendChild(img);
               gallery.appendChild(title);
               gallery.appendChild(tag);
           });
       })
       .catch(error => console.error("Error fetching data:", error));
});
