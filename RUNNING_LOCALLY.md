# Running the Application Locally

The errors you are seeing occur because the project uses an `app` package folder, which implies the command must be run exactly from the `backend` directory.

Follow these steps exactly to run both servers simultaneously.

## 1. Start the Backend

You must start the backend from the `backend` folder (not the `app` folder).

1. Open a terminal.
2. Navigate to your backend directory:
   ```bash
   cd c:\Users\LENOVO\Documents\college\clubs\quantnum\equation26\backend
   ```
3. Activate your virtual environment:
   ```bash
   venv\Scripts\activate
   ```
4. Start the backend using `uvicorn`:
   ```bash
   uvicorn app.main:app --reload
   ```
   *Your backend is now running at `http://127.0.0.1:8000`. Keep this terminal open!*

## 2. Start the Frontend

Next.js will handle the React interface on a separate port.

1. Open a **second entirely new terminal window**.
2. Navigate to the frontend folder:
   ```bash
   cd c:\Users\LENOVO\Documents\college\clubs\quantnum\equation26\frontend
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Once Next.js is ready, open your web browser and go to: **http://localhost:3000**

You're done! Both servers are now connected, and you should be able to evaluate the newly added features.
