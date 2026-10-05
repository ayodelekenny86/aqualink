@echo off
REM AquaLink deployment script (Windows)
REM Run from repo root after: supabase login

echo === AquaLink deployment ===

REM 1. Apply database migrations (Realtime publications for orders + notifications)
echo ^>^> Applying Supabase migrations...
supabase db push
if errorlevel 1 (
    echo Migration failed
    exit /b 1
)

REM 2. Deploy Edge Functions
echo ^>^> Deploying notifications function...
supabase functions deploy notifications
if errorlevel 1 (
    echo Function deploy failed
    exit /b 1
)

REM 3. Build production bundle
echo ^>^> Building production bundle...
npm run build
if errorlevel 1 (
    echo Build failed
    exit /b 1
)

REM 4. Deploy to Vercel
echo ^>^> Deploying to Vercel...
vercel --prod
if errorlevel 1 (
    echo Vercel deploy failed
    exit /b 1
)

echo.
echo === Deployment complete ===
echo Run 'npm run verify:live' to confirm everything is green.