# FF Arena

Ganapati Special Free Fire tournament registration and admin dashboard.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:5000` for the public site and `http://localhost:5000/admin.html` for admin controls.

Registered teams are stored in `teams.json`.

## Deploy on Render

1. Create a Render account at https://render.com.
2. Select **New > Web Service** and connect `pavanlondhe/free-fire-tournament`.
3. Render will use `render.yaml`, or set Build Command to `npm install` and Start Command to `npm start`.

The current JSON storage is suitable for a demo. Use a hosted database for permanent production data because local files can reset on service redeploys.