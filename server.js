const app = require("./api/index");
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Voice agent bridge running on port ${port}`));