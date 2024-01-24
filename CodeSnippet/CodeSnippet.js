document.addEventListener("DOMContentLoaded", displayCodeSnippets);
function displayCodeSnippets() {
   const codeContainer = document.getElementById("codeContainer");
   const codeData = [
    {
        title: 'Get AppSetting Connection String',

        code:`
        private readonly AppSettings appSettings;
        private readonly string oracleConnection;`+`
        public OracleTest(IOptions<AppSettings> appSettings)
        {
            this.appSettings = appSettings?.Value ?? throw new ArgumentNullException(nameof(appSettings));
            oracleConnection = this.appSettings.OracleConnection;
        }`
        ,

        description: 'This code is for getting connection string from Appsetting ',
        tags: ['C#', '.net ']
    },





    {
           title: 'JavaScript Hello World',
           code: 'function helloWorld() {\n    console.log("Hello, World!");\n}',

           description: 'Prints "Hello, World!" to the console. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed consequat justo et aliquam eleifend.',
           tags: ['javascript', 'programming']
       },
       {
           title: 'HTML Heading',
           code: '<h1>Hello, HTML!</h1>',
           description: 'Displays a heading in HTML. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
           tags: ['html', 'web']
       },







       // Add more code snippets as needed
   ];
   codeData.forEach((snippet, index) => {
       const snippetDiv = document.createElement("div");
       snippetDiv.classList.add("codeSnippet");
       const countTitleContainer = document.createElement("div");
       countTitleContainer.classList.add("codeCountTitleContainer");
       const countElement = document.createElement("p");
       countElement.classList.add("codeCount");
       countElement.textContent = index + 1;
       countTitleContainer.appendChild(countElement);
       const titleElement = document.createElement("p");
       titleElement.classList.add("codeTitle");
       titleElement.textContent = snippet.title;
       countTitleContainer.appendChild(titleElement);
       snippetDiv.appendChild(countTitleContainer);
       const codeElement = document.createElement("code");
       codeElement.textContent = snippet.code;
       snippetDiv.appendChild(codeElement);
       const readMoreContainer = document.createElement("div");
       readMoreContainer.classList.add("readMoreContainer");
       const descriptionElement = document.createElement("p");
       descriptionElement.classList.add("codeDescription");
       descriptionElement.textContent = snippet.description;
       readMoreContainer.appendChild(descriptionElement);
       const readMoreButton = document.createElement("button");
       readMoreButton.classList.add("readMoreButton");
       readMoreButton.textContent = "Read More";
       readMoreButton.addEventListener("click", () => toggleDescription(readMoreContainer));
       snippetDiv.appendChild(readMoreButton);
       snippetDiv.appendChild(readMoreContainer);
       const tagsElement = document.createElement("p");
       tagsElement.classList.add("codeTags");
       tagsElement.textContent = `Tags: ${snippet.tags.join(', ')}`;
       snippetDiv.appendChild(tagsElement);
       const copyButton = document.createElement("button");
       copyButton.classList.add("copyButton");
       copyButton.textContent = "Copy Code";
       copyButton.addEventListener("click", () => copyCodeToClipboard(snippet.code));
       snippetDiv.appendChild(copyButton);
       codeContainer.appendChild(snippetDiv);
   });
   // You can add this line if you want to initially set dark mode based on user preference or other factors.
   // document.body.classList.toggle("dark-mode", isDarkModeEnabled());
}
function toggleDarkMode() {
   document.body.classList.toggle("dark-mode");
}
function copyCodeToClipboard(code) {
   navigator.clipboard.writeText(code)
       .then(() => alert("Code copied to clipboard!"))
       .catch(err => console.error("Error copying code:", err));
}
function toggleDescription(readMoreContainer) {
   readMoreContainer.classList.toggle("expanded");
}