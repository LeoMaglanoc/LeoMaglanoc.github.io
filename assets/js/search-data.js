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
        },{id: "post-my-research-goals",
        
          title: "My Research Goals",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/research-goals/";
          
        },
    },{id: "post-ai-coding-agent-case-study-gaming-library",
        
          title: "AI Coding Agent Case Study: Gaming Library",
        
        description: "",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/AI-coding-agent-case-study/";
          
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
            },},{id: "poetry-virtue",
          title: 'Virtue',
          description: "",
          section: "Poetry",handler: () => {
              window.location.href = "/poetry/virute/";
            },},{id: "poetry-climbing-mountains",
          title: 'Climbing Mountains',
          description: "",
          section: "Poetry",handler: () => {
              window.location.href = "/poetry/climbing-mountains/";
            },},{id: "posts-displaying-external-posts-on-your-al-folio-blog",
          title: 'Displaying External Posts on Your al-folio Blog',
          description: "",
          section: "Posts",handler: () => {
              window.location.href = "/blog/2022/displaying-external-posts-on-your-al-folio-blog/";
            },},{id: "posts-google-gemini-updates-flash-1-5-gemma-2-and-project-astra",
          title: 'Google Gemini updates: Flash 1.5, Gemma 2 and Project Astra',
          description: "We’re sharing updates across our Gemini family of models and a glimpse of Project Astra, our vision for the future of AI assistants.",
          section: "Posts",handler: () => {
              window.location.href = "/blog/2024/google-gemini-updates-flash-15-gemma-2-and-project-astra/";
            },},{id: "projects-siemens-mentoring-programme",
          title: 'Siemens Mentoring Programme',
          description: "Siemens RIE mentorship and hackathon pitch on smart 3D printing with machine learning.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/siemens-mentoring-programme/";
            },},{id: "projects-tum-practical-on-vision-based-autonomous-drone",
          title: 'TUM Practical on Vision-Based Autonomous Drone',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/autonomous-drone-practical/";
            },},{id: "projects-tum-hiwi-on-safe-robotics",
          title: 'TUM HiWi on Safe Robotics',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/robotics-research-assistant/";
            },},{id: "projects-ai-ml-research-intern-at-bmw-on-neuro-inspired-computing-for-tactile-sensing",
          title: 'AI/ML Research Intern at BMW on Neuro-Inspired Computing for Tactile Sensing',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/BMW/";
            },},{id: "projects-master-39-s-thesis-with-foundation-on-language-guided-humanoid-manipulation",
          title: 'Master&amp;#39;s Thesis with Foundation on Language-Guided Humanoid Manipulation',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/foundation/";
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
          window.open("mailto:%6C%65%6F.%6D%61%67%6C%61%6E%6F%63@%74%75%6D.%64%65", "_blank");
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
        id: 'social-scholar',
        title: 'Google Scholar',
        section: 'Socials',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=bSMJcYMAAAAJ", "_blank");
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
