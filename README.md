First-time setup:
Install: Node.js (v24), Postman, MySQL Workbench
Then fully close and reopen VS Code.

git clone https://github.com/joshv33526/IFT-401-Capstone.git
cd IFT-401-Capstone
code .

After the setup/pull request for scaffold is merged, everyone run:
git checkout main
git pull
npm install # run again after pulling changes that touch package.json or package-lock.json. # after deleting node_modules (sometimes done to fix dependency errors). # after upgrading Node to a newer version.

Test to make sure it all works:
node -v
npm -v
git --version
npm run dev # Should print out: Server running on
http://localhost:3000 # In any browser
Then open http://localhost:3000/api/health # Should show {"status":"ok"}

For Website:
http://localhost:3000/dashboard.html

Quick Start to ignore the mess below:

At start of any session (to ensure we are all up to date on anything pushed):
git checkout main
git pull
npm install # if package files changed
git checkout function/<branch>
git merge main
npm run dev

End of any session to upload any changes made:
Stop the server with 'Ctrl + C' then:
git status # check: no node_modules/, .env, or .pem
git add .
git commit -m "Add details in quotations so we know what was done"
git push # first push of a new branch: git push -u origin <branch>

/ Going forward:

Work on function/... branches, never directly on main. Push your branch, then open a pull request.
Before starting work, run the start-of-session commands above (one per line), so you build on the latest code.
Run git status before every git add .. node_modules/, .env, or .pem files should never appear there.
All frontend files (HTML, CSS, client JavaScript) go in public/. Only files in that folder are served to the browser.
Run the app with npm run dev, then go to http://localhost:3000. It restarts automatically when you save.
Before installing a new npm package, tell the group, and commit package.json and package-lock.json together, so we don't get conflicting versions.
Later you'll copy .env.example to .env and fill in the database info. Share passwords privately, never in GitHub.
After the first pull, some files might show as "modified" because of the new line-ending settings (.gitattributes). That's a one-time effect.
npm may warn that bcrypt's install scripts weren't approved. That's fine; bcrypt works without them.
Do all work in your local clone. Do not edit files on the GitHub website.

/ Command cheat sheet \

Save and share your work:
git status # check what changed (look for node_modules/.env!)
git add .
git commit -m "Describe what you did"
git push # first push of a new branch: git push -u origin <branch>

Then open a PR on GitHub: base main ← your branch.

Branches:
git branch # list local branches; \* = current
git branch -a # include remote branches
git checkout -b <new-branch> # create and switch (do this from an updated main)
git checkout <branch> # switch to an existing branch

Node and npm:
npm install # after cloning or pulling, rebuild node_modules
npm install <package> # add a runtime dependency
npm install --save-dev <pkg> # add a dev-only tool
npm run dev # run with auto-restart (nodemon)
npm start # run normally (what EC2 will use)

Ctrl + C stops the server.

Quick checks:
git remote -v # confirm repo URL
node -v ; npm -v # confirm installs
pwd # confirm which folder you're in
