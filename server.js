// Import Dependencies
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet'); // Security headers
require('dotenv').config();

// Initialize Express App
const app = express();
app.use(express.json()); // Middleware for parsing JSON
app.use(helmet()); // Adds security headers

// -------------------
// Logger Middleware: Logs timestamp, HTTP method, and route
// -------------------
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// -------------------
// Connect to MongoDB
// -------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully ✅');
  } catch (error) {
    console.error('❌ MongoDB Connection Failed:', error.message);
    process.exit(1);
  }
};

// -------------------
// Schema Definitions
// -------------------
const { Schema } = mongoose;

// User Schema
const userSchema = new Schema({
  name: { type: String, required: true, minlength: 3 },
  email: { type: String, required: true, unique: true, match: /.+\@.+\..+/ },
  createdAt: { type: Date, default: Date.now }
});

// Recipe Schema
const recipeSchema = new Schema({
  title: { type: String, required: true, minlength: 3 },
  description: String,
  ingredients: { type: [String], required: true },
  instructions: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Archived Recipe Schema for Deletion Archiving
const archivedRecipeSchema = new Schema({
  title: { type: String, required: true, minlength: 3 },
  description: String,
  ingredients: { type: [String], required: true },
  instructions: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  archivedAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const ArchivedRecipe = mongoose.model('ArchivedRecipe', archivedRecipeSchema);

// -------------------
// Helper Functions
// -------------------
const archiveRecipe = async (recipeId) => {
  const recipe = await Recipe.findById(recipeId);
  if (recipe) {
    const archived = new ArchivedRecipe({ ...recipe.toObject(), archivedAt: new Date() });
    await archived.save();
  }
};

// -------------------
// Route Handlers
// -------------------

// Add User
app.post('/add-user', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Name and Email are required.' });

    const user = new User({ name, email });
    await user.save();
    res.status(201).json({ message: 'User successfully created!', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add Recipe
app.post('/add-recipe', async (req, res) => {
  try {
    const { title, description, ingredients, instructions, author } = req.body;
    const recipe = new Recipe({ title, description, ingredients, instructions, author });
    await recipe.save();
    res.status(201).json({ message: 'Recipe added successfully!', recipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update Recipe
app.put('/update-recipe/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const updateData = req.body;
    const updatedRecipe = await Recipe.findByIdAndUpdate(recipeId, updateData, { new: true, runValidators: true });

    if (!updatedRecipe) return res.status(404).json({ message: 'Recipe not found' });
    res.json({ message: 'Recipe updated successfully!', updatedRecipe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Recipe and Archive
app.delete('/delete-recipe/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    await archiveRecipe(recipeId);

    const deletedRecipe = await Recipe.findByIdAndDelete(recipeId);
    if (!deletedRecipe) return res.status(404).json({ message: 'Recipe not found' });

    res.json({ message: 'Recipe archived and deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get All Recipes (With Search)
app.get('/recipes', async (req, res) => {
  try {
    const query = req.query.title ? { title: { $regex: req.query.title, $options: 'i' } } : {};
    const recipes = await Recipe.find(query).populate('author', 'name email');
    res.json(recipes);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Recipe by ID and Increment Views
app.get('/recipe/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const recipe = await Recipe.findByIdAndUpdate(recipeId, { $inc: { views: 1 } }, { new: true }).populate('author');

    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get User's Recipes
app.get('/user-recipes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const recipes = await Recipe.find({ author: userId });
    res.json(recipes);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Total Views by User
app.get('/user/:userId/views', async (req, res) => {
  try {
    const { userId } = req.params;
    const recipes = await Recipe.find({ author: userId });
    const totalViews = recipes.reduce((acc, recipe) => acc + recipe.views, 0);
    res.json({ totalViews });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Most Viewed Recipe by User
app.get('/user/:userId/highestviews', async (req, res) => {
  try {
    const { userId } = req.params;
    const mostViewedRecipe = await Recipe.findOne({ author: userId }).sort({ views: -1 });
    if (!mostViewedRecipe) return res.status(404).json({ message: 'No recipes found' });
    res.json(mostViewedRecipe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// Increment Recipe View (GET /recipes/view/:recipeId)
app.get('/recipes/view/:recipeId', async (req, res) => {
    try {
      const { recipeId } = req.params;
      const recipe = await Recipe.findByIdAndUpdate(
        recipeId,
        { $inc: { views: 1 } },
        { new: true }
      );
      if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
      res.json({ message: 'View incremented', views: recipe.views });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

// Application Analytics
app.get('/analytics', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalRecipes = await Recipe.countDocuments();
    const avgRecipesPerUser = totalUsers ? (totalRecipes / totalUsers).toFixed(2) : 0;

    const mostViewed = await Recipe.findOne().sort({ views: -1 });
    const leastViewed = await Recipe.findOne().sort({ views: 1 });

    res.json({
      totalUsers,
      totalRecipes,
      avgRecipesPerUser,
      mostViewedRecipe: mostViewed || 'No recipes yet',
      leastViewedRecipe: leastViewed || 'No recipes yet'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 404 Error Handler for Undefined Routes
app.use((req, res, next) => {
    res.status(404).json({
      success: false,
      message: 'Route not found. Please check the URL.'
    });
  });

  // Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(`Error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error. Please try again later.'
    });
  });

// -------------------
// Start Server Function
// -------------------
const startServer = async () => {
  await connectDB();
  const PORT = process.env.PORT || 5004;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
};

// Start the server
startServer();