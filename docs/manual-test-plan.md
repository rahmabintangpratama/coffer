# Manual test plan for Coffer 0.1.0

- **Purpose:** step-by-step checks that only the owner can do (real provider accounts, real devices, screen readers), each with an expected result and a place to record pass or fail.
- **Status:** Draft (filled in during M10 phase B).
- **Last updated:** 2026-11-22
- **Source files in `design/`:** none (derived from [technical-spec.md](technical-spec.md) sections 15.5, 15.6 and 15.7 and `design/providers.json`).
- **Related:** [release-checklist.md](release-checklist.md), [deploy/cloudflare-pages.md](deploy/cloudflare-pages.md), [technical-spec.md](technical-spec.md), [implementation-plan.md](implementation-plan.md) (M10)

This is the list of checks that only the owner can do: they need real accounts, real devices or a screen reader. You do not need to know the code. Follow each step, compare what you see with **Expected**, and write **Pass** or **Fail** and a note in the last two columns. Copy this file, or fill it in place and commit it.

Everything the machine can check is already done in CI; see [release-checklist.md](release-checklist.md).

## How to use this plan

1. Read "Before you start" once.
2. Do the sections in this order: A (setup), B (provider matrix), C (temporary credentials), D (desktop browsers and Local Network Access), E (phones), F (screen readers). Sections B to F can be split across days.
3. After each section, fill in the summary line. A section passes only when every row is Pass.
4. A **Fail** is not a reason to stop: write what you saw (and a screenshot name if you took one), and carry on with the next row. The notes become issues.
5. Use only **throwaway buckets** and **scoped keys** you can delete afterwards. Never use an admin key, a root key or a bucket that holds real data.

Record at the top of your copy:

| Field | Value |
|---|---|
| Date | |
| Tester | |
| Coffer version | `0.1.0` (About page shows it) |
| Deployed URL tested | `https://...pages.dev` |
| Commit (About page, or the deployment page) | |

## Before you start

You need:

- The deployed preview or production URL from [deploy/cloudflare-pages.md](deploy/cloudflare-pages.md). Open it once in a normal window and check that Welcome loads.
- A terminal with `curl` and either the AWS CLI or the `mc` MinIO client (only for sections C and D).
- Test files. Create them once in an empty folder called `coffer-testdata`:

  macOS or Linux:

  ```sh
  mkdir -p coffer-testdata/many && cd coffer-testdata
  echo "hello" > small-1kb.txt
  head -c 1024 /dev/urandom > small-1kb.bin
  dd if=/dev/urandom of=multipart-20mib.bin bs=1048576 count=20
  dd if=/dev/urandom of=large-200mib.bin bs=1048576 count=200
  for i in $(seq 1 1000); do echo "$i" > "many/file-$i.txt"; done
  echo "x" > "weird #? %+ name é 日本語.txt"
  ```

  Windows (PowerShell):

  ```powershell
  mkdir coffer-testdata\many; cd coffer-testdata
  "hello" | Out-File small-1kb.txt
  fsutil file createnew multipart-20mib.bin 20971520
  fsutil file createnew large-200mib.bin 209715200
  1..1000 | ForEach-Object { "$_" | Out-File "many\file-$_.txt" }
  "x" | Out-File "weird #? %+ name é 日本語.txt"
  ```

- Also a picture, a short video (a few MB), an MP3 and a PDF to preview.

## A. Setup check (about 5 minutes)

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| A1 | Open the deployed URL in a private window. | Welcome shows with the Coffer name, three facts and a "Connect a bucket" button. There is no "Explore with sample files". | | |
| A2 | Open the browser's developer tools console and reload. | No red errors. No messages about Content-Security-Policy. | | |
| A3 | Run `pnpm headers:check --url <deployed-url>` from the repo (see the deploy guide). | Prints `OK` and exits with code 0. | | |
| A4 | Open Settings, then About. | The version is `0.1.0`, the origin is the deployed address, and the MIT text and the IBM Plex credit show. | | |

Section A summary: Pass / Fail. Notes:

## B. Provider compatibility matrix

Run the **core pass** (B-core) once per provider below, with the provider's own setup steps first. Use a **new empty bucket** for each provider. After the run, delete the bucket and the key.

### B-core: the steps to repeat for every provider

Use the provider's section for step 1 and the key. Open Coffer in a private window each time.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| core-1 | Welcome, **Connect a bucket**, choose the provider, fill the form with the scoped key, **Connect**. | If the bucket has no CORS rule yet: a screen titled "Your bucket needs a CORS rule" with a rule to copy and the allowed origin shown. | | |
| core-2 | Add the CORS rule exactly as Coffer shows it (JSON or XML tab, as the provider asks), with your deployed URL as the allowed origin. Back in Coffer press **I've added it · Check again**. | Six checks pass (Reach, CORS, List, Write, Read, Clean up). The screen says "Connected". If it still fails, the "Still failing?" hint appears: note which provider message you got. | | |
| core-3 | **Open bucket**, then **Not now** on the save screen. | The Files screen opens. The bucket is empty ("No files here yet" or similar). | | |
| core-4 | Upload `small-1kb.txt` and `small-1kb.bin` with **New**, **Upload files**. | Both appear in the list with the right sizes. | | |
| core-5 | Upload `multipart-20mib.bin`. | A progress bar shows; it ends as Done. The file shows 20.0 MiB. | | |
| core-6 | Upload `large-200mib.bin`. | It finishes (it can take minutes). The file shows 200.0 MiB. Open the browser's Network tab if it stalls and note the failing request. | | |
| core-7 | Make a folder with **New**, **New folder**, named `moved`. Select `multipart-20mib.bin`, **Move**, choose `moved`, **Move here**. | A toast "Moved multipart-20mib.bin" with Undo. The file is now inside `moved`. | | |
| core-8 | Open the menu (⋮) of `small-1kb.bin` and choose **Make a copy**. | A new file `small-1kb (copy).bin` appears next to it. | | |
| core-9 | Copy a file larger than the provider's single-copy limit, if you have one (5 GB on AWS S3 is too big to test; skip and write "n/a"). Otherwise move `large-200mib.bin` into `moved`. | The move completes with a progress row and ends with the file in `moved`. | | |
| core-10 | Upload the whole `many` folder (**New**, **Upload folder**, choose `coffer-testdata/many`). | 1,000 files appear. The panel ends with "Uploaded 1,000 items". | | |
| core-11 | Select all files in `many` and choose **Move to trash**, then open **Trash**, **Select all**, **Delete forever**, type the count, confirm. | The deletion shows progress and finishes. The trash is empty. If the provider rejects the batch delete, the app falls back to one request per file and still finishes: write "fallback used" in Notes if it took very long. | | |
| core-12 | Open `small-1kb.txt`. Download it. Preview it. | The preview shows the text. The download saves the file with the same name. | | |
| core-13 | Upload a picture, a short video, an MP3 and a PDF, and open each. | The picture shows. The video and the MP3 play. The PDF renders its pages. | | |
| core-14 | Open the menu of the picture and choose **Share link**. Choose 15 minutes, **Create link**, copy it, open it in another browser profile. | The picture downloads or shows. Then create a 7-day link: it works too. If the provider refuses 7 days, note the error. | | |
| core-15 | Upload `weird #? %+ name é 日本語.txt`. Open it, rename it to `weird #2.txt`, then move it to the trash and back. | The name is shown exactly. Every step works. | | |
| core-15a | Upload two files named `a b.txt` and `a%20b.txt`, and `c+d.txt`. Check the list, then move `a%20b.txt` to the trash. Open the trash. | All three names are shown exactly as typed, and only `a%20b.txt` goes to the trash; `a b.txt` stays. This checks that the provider honours URL-encoded listings. If the list shows `a b.txt` twice or a name changes, note the provider (M10 audit lead S-2). | | |
| core-16 | Leave the tab. Reload the page. | The app is back at Welcome (the keys were only in memory). | | |
| core-17 | Connect again, this time with a key that has **only read access** (see the provider's section for how). | The test ends with "This key can read but not write" and offers **Connect read-only** and **Edit keys**. After **Connect read-only**: the Read-only badge shows, "New" is missing and the menus show "This key is read-only". | | |
| core-18 | Try a wrong region (where the provider has regions) and a wrong bucket name. | A clear message ("Bucket not found" or "Bucket not found in this region") with a button to fix it. No raw error text. | | |

### B1. Cloudflare R2

Setup:

1. In the Cloudflare dashboard open **R2 Object Storage** and **Create bucket** (any name, for example `coffer-test-r2`).
2. Open the bucket, **Settings**, **CORS Policy**, but do not add a rule yet (the CORS-fail case is part of core-1).
3. **R2 Object Storage**, **Manage R2 API Tokens**, **Create API token**: permission **Object Read & Write**, scoped to this one bucket. Copy the Access Key ID and Secret Access Key (shown once). Also create a second token with **Object Read only**, scoped to the bucket, for core-17.
4. Your Account ID is on the R2 overview page.
5. In Coffer choose **Cloudflare R2**: fill Account ID, jurisdiction (Default), the two keys, and the bucket name.
6. When Coffer asks for the CORS rule, open the bucket's Settings, **CORS Policy**, **Add CORS policy**, and paste the JSON from Coffer.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B1-1 | Run B-core with the read/write token (core-17 with the read-only token). | Every core row passes. | | |
| B1-2 | Check that Region shows `auto` and that you were not asked for one. | The form has no region field; the endpoint shown is `https://<account>.r2.cloudflarestorage.com`. | | |

### B2. Backblaze B2

Setup:

1. In Backblaze open **Buckets**, **Create a Bucket** (private). Note its **Endpoint** (for example `s3.us-west-004.backblazeb2.com`): the part after `s3.` is the region.
2. **Application Keys**, **Add a New Application Key**: allow access to this bucket only, **Read and Write**. Do not use the master key. Copy keyID and applicationKey. Make a second key with **Read Only** for core-17.
3. B2 needs CORS rules set per bucket: **Buckets**, your bucket, **CORS Rules**, then use the option that lets you enter custom rules and paste the rule Coffer shows (XML or JSON as offered). If the page only offers the "share everything" preset, do not use it: use the CLI (`b2 bucket update --cors-rules ...`) with Coffer's rule, or note the limitation in Notes.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B2-1 | Run B-core. | Every core row passes. | | |
| B2-2 | In the form, check that the Region field matches your endpoint. | A region from your endpoint (for example `us-west-004`) makes the test pass. | | |
| B2-3 | Check the warning text about buckets created before May 2020. | The help steps mention it. | | |

### B3. Wasabi

Setup:

1. In the Wasabi console create a bucket in one region (for example `us-east-1`).
2. **Access Keys**, create a key. For a scoped key create a sub-user with a policy limited to the bucket, then create its key. For core-17 create a sub-user with a read-only policy.
3. CORS: Wasabi sets CORS on the bucket in the console (**Buckets**, your bucket, **Settings**, **CORS Configuration**); paste Coffer's XML rule.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B3-1 | Run B-core. | Every core row passes. | | |
| B3-2 | Choose a region that is **not** your bucket's region in the form. | "Bucket not found in this region", with a button that switches to the right region. | | |

### B4. Amazon S3

Setup:

1. In the AWS console open **S3** and **Create bucket** in one region. Keep "Block all public access" on.
2. **IAM**, **Users**, create a user `coffer-test`. Attach an inline policy that allows only the bucket (replace `BUCKET`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::BUCKET" },
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListBucketMultipartUploads"], "Resource": "arn:aws:s3:::BUCKET/*" }
     ]
   }
   ```

   Create an access key for the user (use case: "Application running outside AWS"). For core-17 make a second user whose policy has only `s3:ListBucket` and `s3:GetObject`.
3. CORS: bucket, **Permissions**, **Cross-origin resource sharing (CORS)**, **Edit**, paste the JSON from Coffer. The `ETag` header must be in `ExposeHeaders` (Coffer's rule has it).

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B4-1 | Run B-core. | Every core row passes. | | |
| B4-2 | In core-6 (200 MiB), watch that the upload uses several parts. | The progress moves in steps; at the end the object is one file of 200.0 MiB. | | |

### B5. DigitalOcean Spaces

Setup:

1. **Spaces Object Storage**, **Create a Spaces Bucket** in one datacenter (for example `sgp1`). Keep file listing restricted.
2. **API**, **Spaces Keys**, **Generate New Key**. Use a key limited to this bucket with read/write/delete. For core-17 make a read-only key.
3. CORS: the Space's **Settings**, **CORS Configurations**, **Add**: allowed origin your deployed URL, methods GET, PUT, POST, DELETE, HEAD, allowed headers `*`, expose `ETag`. (Spaces uses its own form; Coffer's rule shows the values to copy.)

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B5-1 | Run B-core. | Every core row passes. | | |
| B5-2 | In the form, check that you give the datacenter and not a region. | A datacenter such as `sgp1` is asked for; the app signs with `us-east-1` by itself. | | |

### B6. MinIO or any other S3-compatible server (custom)

Use MinIO in Docker on a machine with a **valid HTTPS** address (a browser blocks an `http` LAN address from the https page; localhost is allowed and is tested in section D).

Setup:

1. Run MinIO behind HTTPS (for example `https://minio.example.com`), or use a hosted MinIO/S3-compatible service.
2. In the MinIO Console create a bucket and an access key limited to it by a policy. For core-17 a read-only policy key.
3. CORS: set `MINIO_API_CORS_ALLOW_ORIGIN` to your deployed URL on the server and restart it.
4. In Coffer choose **MinIO** (or **Other S3-compatible service**), enter the endpoint, region `us-east-1`, the keys and the bucket.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| B6-1 | Run B-core. | Every core row passes. | | |
| B6-2 | Choose **Other S3-compatible service**, same endpoint. Under **Advanced options** switch addressing to **Path**. | The connection test passes with Path and gives a clear message if Virtual addressing does not work. | | |

Section B summary (one line per provider): R2 / B2 / Wasabi / S3 / Spaces / MinIO: Pass or Fail. Notes:

## C. Temporary credentials (session tokens)

Goal: prove that share links made with a session token expire with the token (the test fixture cannot do this, see D-46).

### C1. AWS STS

1. With your scoped IAM user from B4, create a role the user may assume, or simply use `get-session-token`:

   ```sh
   aws sts get-session-token --duration-seconds 3600
   ```

   (A role with `assume-role` works the same way: `aws sts assume-role --role-arn ARN --role-session-name coffer-test --duration-seconds 3600`.) The output has `AccessKeyId`, `SecretAccessKey`, `SessionToken` and `Expiration`.
2. Note: `get-session-token` keys inherit the user's permissions. Use the bucket from B4.
3. In Coffer choose **Amazon S3**, fill the region and the temporary key and secret. Open **Advanced options** and paste the session token and the **Token expires at** time (the `Expiration` value, a UTC timestamp).

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| C1-1 | Connect and open the bucket (**Not now**). | The test passes with the temporary key. | | |
| C1-2 | Open a file's menu, **Share link**. | A notice says the link stops working when the session token expires. With about 1 hour left, only 15 minutes, 30 minutes and 1 hour are enabled; 1 day and 7 days are shown but disabled. The longest allowed choice is preselected. | | |
| C1-3 | Create the longest-allowed link, copy it, open it in another browser. | The file downloads. | | |
| C1-4 | Wait until the token expires, then open the same link again. | The provider answers with an error (expired token). Note the time you waited. | | |
| C1-5 | Connect again with a token and **leave the "Token expires at" field empty**. Open **Share link**. | The notice says Coffer doesn't know when the token expires, so links last at most 1 hour. 1 day and 7 days are disabled. | | |
| C1-6 | Connect with a token that has under 15 minutes left (create one with `--duration-seconds 900`, then wait until about 10 minutes remain), with the expiry filled in. Open **Share link**. | The notice says the token expires in under 15 minutes, so a link can't be created. No choice is enabled. | | |

### C2. Cloudflare R2 temporary credentials

1. Create temporary credentials for your R2 bucket. At the time of writing, Cloudflare's API is `POST https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/r2/temp-access-credentials` with a JSON body naming the `bucket`, the parent access key id (`parentAccessKeyId`), a `permission` (for example `object-read-write`) and `ttlSeconds` (for example 3600), authenticated with an API token that may manage R2. The reply has `accessKeyId`, `secretAccessKey` and `sessionToken`. **Check the current Cloudflare documentation first**: if the endpoint or the field names differ, follow the documentation and note the difference here.
2. In Coffer choose **Cloudflare R2**, fill the temporary key and secret and, under **Advanced options**, the session token and expiry time (now plus `ttlSeconds`).

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| C2-1 | Connect and open the bucket. | The test passes. | | |
| C2-2 | **Share link** on a file, longest allowed choice, download it from another browser. | The file downloads. | | |
| C2-3 | After the token expires, open the link again. | It stops working. Note the time. | | |
| C2-4 | Repeat C1-5 and C1-6 with the R2 token. | Same messages as for AWS. | | |

Section C summary: Pass / Fail. Notes:

## D. Desktop browsers and Local Network Access

Browsers to run: **Chrome stable**, **Microsoft Edge stable**, **Firefox stable**, **Safari** (macOS). Write the version of each.

### D0. A local S3 server to test with

Run the test fixture on your own machine (Docker needed):

```sh
git clone <the repo> && cd coffer
docker compose -f tests/integration/docker-compose.yml up -d --wait
```

It serves S3 on `http://127.0.0.1:9000` with the fake keys `coffer-test-key` and `coffer-test-secret-not-real`. Make a bucket and give it a CORS rule for your deployed URL (replace `ORIGIN`):

```sh
export AWS_ACCESS_KEY_ID=coffer-test-key AWS_SECRET_ACCESS_KEY=coffer-test-secret-not-real AWS_DEFAULT_REGION=us-east-1
aws --endpoint-url http://127.0.0.1:9000 s3 mb s3://lan-test
aws --endpoint-url http://127.0.0.1:9000 s3api put-bucket-cors --bucket lan-test --cors-configuration '{"CORSRules":[{"AllowedOrigins":["ORIGIN"],"AllowedMethods":["GET","PUT","POST","DELETE","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag","Date"],"MaxAgeSeconds":3000}]}'
```

For the LAN case, find your computer's LAN address (for example `192.168.1.20`) and make sure the Docker port is reachable on it (`http://192.168.1.20:9000/health` answers in a browser).

### D1. The core flows (do in each browser)

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| D1-1 | Open the deployed URL. Connect with a provider bucket from section B (any one). | The connection test passes. | | |
| D1-2 | Browse a folder, search with `/` in the search pill, sort by size, switch list and grid. | All work; no layout breaks. | | |
| D1-3 | Upload a file, rename it, move it, trash it, undo, restore. | All work. | | |
| D1-4 | Open each preview type: picture, video, MP3, PDF, a text file. | All render. | | |
| D1-5 | Settings: switch theme to Dark and back, change density, reload. | Settings persist; in Dark everything is readable. | | |
| D1-6 | Save the connection with a passphrase, reload, unlock, lock from Settings, unlock. | Works; a wrong passphrase shows "That passphrase doesn't match". | | |
| D1-7 | Open the app in two tabs, lock in one. | The other tab shows the locked screen within about a second. | | |

### D2. Local Network Access (Chrome and Edge)

Chrome and Edge ask for permission before a public page reaches a local address. The app shows a notice first.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| D2-1 | In a fresh profile or after resetting site settings, connect with endpoint `http://localhost:9000`, bucket `lan-test`, the fake keys. | Before the browser asks, a Coffer screen explains it: "Your browser will ask to reach your local network" with a Continue button. No browser prompt yet. | | |
| D2-2 | Press **Continue**. When the browser asks, choose **Allow**. | The test passes. | | |
| D2-3 | Repeat D2-1, but choose **Block** in the browser prompt. | Coffer shows "Your browser blocked access to your local network" with steps and a **Test again** button. | | |
| D2-4 | Open the site settings (padlock icon, Site settings), set **Local network access** to Allow, press **Test again**. | The test passes now. | | |
| D2-5 | Set it back to Block in site settings, reload, connect again. | You get the blocked screen again; the change took effect. | | |
| D2-6 | Repeat D2-1 to D2-3 with the LAN address `http://192.168.x.x:9000`. | The form **refuses** a plain http LAN address: "Use an https address. Plain http only works for localhost." (Browsers do not allow it from an https page.) | | |
| D2-7 | Repeat with `http://127.0.0.1:9000`. | Same as localhost (the pre-notice, then the browser prompt). | | |

Record the exact wording of the browser's prompt and the Chrome/Edge version.

### D3. Local Network Access (Firefox and Safari)

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| D3-1 | In Firefox, connect with `http://localhost:9000`, bucket `lan-test`. | Record what happens. The expected outcome is that no Local Network prompt appears and the test passes (or fails with a clear message). | | |
| D3-2 | In Safari (macOS), same. | Same: no prompt expected. Record what happens, including any Safari warning about mixed content. | | |
| D3-3 | In Firefox and Safari, try the LAN address `http://192.168.x.x:9000`. | The form refuses plain http, as in D2-6. | | |

Section D summary: Chrome / Edge / Firefox / Safari: Pass or Fail. Notes:

## E. Real phones

### E1. iPhone (iOS Safari 16.4 or newer)

Write the iOS version and the phone model. Use the deployed HTTPS URL. Test in Safari (not a home-screen web app).

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| E1-1 | Open the URL. | Welcome fits the screen. No horizontal scroll. The bottom is not hidden under the home bar. | | |
| E1-2 | Connect with a provider bucket. Enter keys with the on-screen keyboard. | Fields do not zoom the page when focused. The keyboard does not cover the Connect button (scroll if needed). | | |
| E1-3 | Rotate to landscape and back. | Layout adapts; nothing is cut off. | | |
| E1-4 | Upload a photo from the photo library with **New**, **Upload files**. | The picker opens, the upload runs, the photo appears. | | |
| E1-5 | Open the photo. Pinch to zoom, double-tap, swipe to the next file. | Zoom and swipe work; "2 of N" updates. | | |
| E1-6 | Play a video and an MP3. | They play inline. | | |
| E1-7 | Long-press a row to select; select two files; use the bar's Download. | Selection starts on long press. Download works (iOS may ask where to save). | | |
| E1-8 | Share link: create one and copy it. Paste it into Notes. | The link copies. (If copy fails, the link text is selected so you can copy it by hand.) | | |
| E1-9 | Save with a passphrase. Lock the phone, wait, return to Safari. | Either the app is where you left it, or it asks for the passphrase. Auto-lock after the chosen time shows the locked screen. | | |
| E1-10 | Switch to Dark mode in iOS Settings. | The app follows the system when Theme is System. | | |
| E1-11 | Open the menu (☰), the connection avatar at the top right, and the "More" tab. | Each opens a sheet that fits; all rows are at least 44 pt tall and easy to tap. | | |

### E2. Android (Chrome)

Write the Android version and phone model.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| E2-1 to E2-11 | Repeat E1-1 to E1-11 on Android Chrome (use the Android back gesture where relevant: it should close sheets and dialogs, then go back in the app). | Same expected results. The back gesture does not leave the app while a dialog is open. | | |

Section E summary: iPhone / Android: Pass or Fail. Notes:

## F. Screen readers

For each screen reader, go through the flows by listening, not by looking. Use the keyboard (or touch gestures on iOS). Expected speech is described in meaning; the exact words may differ a little.

### F1. VoiceOver on macOS (Safari)

Turn on VoiceOver with Cmd+F5.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| F1-1 | Welcome: move through the page. | The heading, three facts as a list, and the "Connect a bucket" button are announced. | | |
| F1-2 | Connection form: tab through the fields. Leave the endpoint empty and submit. | Each field is announced with its label (Endpoint URL, Access Key ID, Secret Access Key, Bucket). The error is announced and focus goes to the first field with a problem. The secret field says it is a secure text field. | | |
| F1-3 | Connection test: submit a valid form. | Progress is announced politely ("Reach endpoint ... Passed"). The result heading ("Connected") is announced. | | |
| F1-4 | Files: move into the list. Use arrow keys. | The list is one stop. Each row says name, type, size and modified. The ⋮ button says "More actions for <name>". | | |
| F1-5 | Select a row with Space. | "Selected" is announced; the selection bar's count is announced. | | |
| F1-6 | Open a menu, a dialog (Rename) and close it with Escape. | The dialog title is announced on open. Focus returns to the button that opened it. | | |
| F1-7 | Start an upload. | "Uploading 1 item" and a progress value are announced. | | |
| F1-8 | Trigger a toast (Move to trash). | "Moved 1 item to trash" is announced; the Undo button is reachable. | | |
| F1-9 | Open a preview. | "Preview of <name>" and "2 of 10" are announced; Escape closes it and focus returns to the row. | | |
| F1-10 | Unlock screen and a wrong passphrase. | The label, then the error text, are announced. | | |
| F1-11 | Settings: move through the list and open a page. | Landmarks and headings let you jump around; radio groups announce their label and the selected item. | | |
| F1-12 | Share link dialog, with a session token. | The warning is announced; disabled choices are announced as dimmed or unavailable, and not hidden. | | |

### F2. VoiceOver on iOS (Safari)

Turn on VoiceOver in Settings, Accessibility. Swipe right and left to move; double-tap to activate.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| F2-1 | Repeat F1-1 to F1-12 with touch gestures (use the rotor to move by headings, links and buttons). | Same announcements as macOS. All controls can be activated by double-tap. The bottom navigation says which item is current. | | |
| F2-2 | Open the connection avatar at the top right. | It is announced as "Switch connection: <name>, Unlocked" (or Locked). | | |
| F2-3 | Open a bottom sheet (row menu). | Focus moves into the sheet; swiping does not reach the page behind it. | | |

### F3. NVDA on Windows (Firefox and Chrome)

Install NVDA (free). Repeat in Firefox, then in Chrome.

| # | Do | Expected | Result | Notes |
|---|---|---|---|---|
| F3-1 | Repeat F1-1 to F1-12 with NVDA (browse mode for pages; Tab and arrows for controls; press `H` to jump headings, `D` for landmarks). | Same announcements. Form fields switch NVDA to focus mode, and errors are read. | | |
| F3-2 | In the Files list, press `Down` and `Up`, `Space`, `Enter`. | Rows read as above; Enter opens a folder or the preview. | | |
| F3-3 | Open the Move dialog (the folder tree). | The tree is announced as a tree with expandable items and "Current location". | | |

Section F summary: VoiceOver macOS / VoiceOver iOS / NVDA Firefox / NVDA Chrome: Pass or Fail. Notes:

## Sign-off

| Section | Pass / Fail | Date | Notes |
|---|---|---|---|
| A Setup | | | |
| B Provider matrix | | | |
| C Temporary credentials | | | |
| D Desktop browsers and Local Network Access | | | |
| E Real phones | | | |
| F Screen readers | | | |

After sign-off, copy the results into the release notes and tick the matching rows in [release-checklist.md](release-checklist.md).
