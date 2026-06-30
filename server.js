require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const routes = require('./src/routes');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// --- Session (required for OAuth & WebAuthn) ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: true,
 cookie: {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'  
}
}));

// --- Passport init ---
app.use(passport.initialize());
app.use(passport.session());

// --- Google OAuth Strategy ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  (accessToken, refreshToken, profile, done) => {
    // Check if user is allowed
    const allowed = process.env.ALLOWED_GOOGLE_ACCOUNTS
      .split(',')
      .map(e => e.trim().toLowerCase());
    const email = profile.emails[0].value.toLowerCase();
    if (allowed.includes(email)) {
      return done(null, profile);
    }
    return done(null, false, { message: 'Unauthorized account' });
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- Auth middleware ---
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// --- Static files (login page, etc.) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Google OAuth routes ---
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
);

// --- WebAuthn routes (we'll mount them later) ---
const webauthnRoutes = require('./src/webauthn');
app.use('/api/webauthn', webauthnRoutes);

// --- Data API routes (protect them) ---
app.use('/api', ensureAuthenticated, routes);

// --- Dashboard – only for authenticated users ---
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Login page ---
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Logout ---
app.get('/logout', (req, res, next) => {
  req.logout(() => {
    req.session.destroy(() => res.redirect('/login'));
  });
});
app.post('/logout', (req, res, next) => {
  req.logout(() => {
    req.session.destroy(() => res.redirect('/login'));
  });
});
// -- - Settings page (for fingerprint registration) ---
app.get('/settings', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// --- Fallback to login ---
app.get('/', (req, res) => res.redirect('/login'));

// --- Start server ---
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  const { startScheduler } = require('./src/scheduler');
  startScheduler();
});