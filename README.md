To launch project:

clone project (I hope you can do that)

```cd [folder of your project]```

```docker compose up --build```

To run ```npm run check:vulnerabilities``` script you have to install snyk globally (```npm i -g snyk```), and authorize in snyk (```snyk auth```). 

After that you can run ```npm run check:vulnerabilities``` script.

(I hope you have docker installed globally. If it's not - install docker via your favorite npm or yarn)

After that in separate terminal run 

```npm i```

(or ```yarn```)

and after installing dependencies is over:

```npm run test```

(or ```yarn test```)

Tests will successfully pass.

You can download my nest-api image by ```docker pull sanich123/project-nest-api```

I hope it'll work:) But the image in docker hub, trust me

Good luck!# runich-backend
