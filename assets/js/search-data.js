// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-cv",
          title: "cv",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "nav-google-scholar",
          title: "google scholar",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/google-scholar/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "Robotics and AI projects I&#39;m working on.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-poetry",
          title: "poetry",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/poetry/";
          },
        },{id: "post-my-research-dream",
        
          title: "My Research Dream",
        
        description: "Why humanoid robots inspire my long-term research goals.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/humanoid-robots/";
          
        },
    },{id: "post-interactive-gravity-sandbox",
        
          title: "Interactive Gravity Sandbox",
        
        description: "A tiny 2D gravity toy you can drag around.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/interactive-visualization/";
          
        },
    },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-member-of-ai-grid-an-ai-research-network-funded-by-the-federal-ministry-of-education-and-research",
          title: 'Member of AI Grid, an AI research network funded by the Federal Ministry...',
          description: "",
          section: "News",},{id: "poetry-love-letter-to-my-younger-self",
          title: 'Love Letter to My Younger Self',
          description: "",
          section: "Poetry",handler: () => {
              window.location.href = "/poetry/love-letter-to-my-younger-self/";
            },},{id: "poetry-climbing-mountains",
          title: 'Climbing Mountains',
          description: "",
          section: "Poetry",handler: () => {
              window.location.href = "/poetry/climbing-mountains/";
            },},{id: "posts-google-gemini-updates-flash-1-5-gemma-2-and-project-astra",
          title: 'Google Gemini updates: Flash 1.5, Gemma 2 and Project Astra',
          description: "We’re sharing updates across our Gemini family of models and a glimpse of Project Astra, our vision for the future of AI assistants.",
          section: "Posts",handler: () => {
              window.location.href = "/blog/2024/google-gemini-updates-flash-15-gemma-2-and-project-astra/";
            },},{id: "projects-robotics-research-assistant",
          title: 'Robotics Research Assistant',
          description: "Provably safe human-robot interaction research with a safety shield at TUM&#39;s Cyber-Physical Systems Group.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/robotics-research-assistant/";
            },},{id: "projects-autonomous-drone-practical",
          title: 'Autonomous Drone Practical',
          description: "Visual-inertial navigation project with AR Drone 2, A* planning, and haptic goal control.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/autonomous-drone-practical/";
            },},{id: "projects-siemens-mentoring-programme",
          title: 'Siemens Mentoring Programme',
          description: "Siemens RIE mentorship and hackathon pitch on smart 3D printing with machine learning.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/siemens-mentoring-programme/";
            },},{
        id: 'social-cv',
        title: 'CV',
        section: 'Socials',
        handler: () => {
          window.open("/assets/pdf/leonardo_maglanoc_cv.pdf", "_blank");
        },
      },{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6C%65%6F.%6D%61%67%6C%61%6E%6F%63@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/LeoMaglanoc", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/leonardo-maglanoc", "_blank");
        },
      },{
        id: 'social-x',
        title: 'X',
        section: 'Socials',
        handler: () => {
          window.open("https://twitter.com/leo_maglanoc", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/feed.xml", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
