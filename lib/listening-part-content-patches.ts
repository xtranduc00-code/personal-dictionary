import type { PartContentMap } from "./listening-part-content";
export const listeningPartContentPatches: Record<string, Partial<PartContentMap>> = {
    "cambridge-12|test-2": {
        part3: {
            matching: {
                instruction: "Choose FIVE answers from the box and write the correct letter, A-G, next to Questions 26-30.",
                options: [
                    { letter: "A", text: "bullet points" },
                    { letter: "B", text: "film" },
                    { letter: "C", text: "notes" },
                    { letter: "D", text: "structure" },
                    { letter: "E", text: "student paper" },
                    { letter: "F", text: "textbook" },
                    { letter: "G", text: "documentary" },
                ],
                items: [
                    { qNum: 26, text: "He'll read a ___ and choose his topic." },
                    { qNum: 27, text: "He'll borrow a ___ from Beth." },
                    { qNum: 28, text: "He'll plan the ___ of the paper." },
                    { qNum: 29, text: "He'll read some source material and write ___." },
                    { qNum: 30, text: "He'll write the paper using ___." },
                ],
            },
        },
    },
    "cambridge-12|test-1": {
        part3: {
            notesCompletion: {
                instruction: "Complete the notes below.",
                instructionSub: "Write ONE WORD ONLY for each answer.",
                sections: [
                    {
                        title: "Study of local library: possible questions",
                        content: [
                            { text: "• whether it has a " },
                            { blank: 24 },
                            { text: " of its own\n• its policy regarding noise of various kinds\n• how it's affected by laws regarding all aspects of " },
                            { blank: 25 },
                            { text: "\n• how the design needs to take the " },
                            { blank: 26 },
                            { text: " of customers into account\n• what " },
                            { blank: 27 },
                            { text: " is required in case of accidents\n• why a famous person's " },
                            { blank: 28 },
                            { text: " is located in the library\n• whether it has a " },
                            { blank: 29 },
                            { text: " of local organisations\n• how it's different from a library in a " },
                            { blank: 30 },
                        ],
                    },
                ],
            },
        },
    },
    "cambridge-19|test-1": {
        part3: {
            matching: {
                instruction: "What is the students' opinion about each of the following food trends? Choose SIX answers from the box and write the correct letter, A-H, next to Questions 25-30.",
                options: [
                    { letter: "A", text: "This is only relevant to young people." },
                    { letter: "B", text: "This may have disappointing results." },
                    { letter: "C", text: "This already seems to be widespread." },
                    { letter: "D", text: "Retailers should do more to encourage this." },
                    { letter: "E", text: "More financial support is needed for this." },
                    { letter: "F", text: "Most people know little about this." },
                    { letter: "G", text: "There should be stricter regulations about this." },
                    { letter: "H", text: "This could be dangerous." },
                ],
                items: [
                    { qNum: 25, text: "Use of local products" },
                    { qNum: 26, text: "Reduction in unnecessary packaging" },
                    { qNum: 27, text: "Gluten-free and lactose-free food" },
                    {
                        qNum: 28,
                        text: "Use of branded products related to celebrity chefs",
                    },
                    {
                        qNum: 29,
                        text: "Development of 'ghost kitchens' for takeaway food",
                    },
                    {
                        qNum: 30,
                        text: "Use of mushrooms for common health concerns",
                    },
                ],
            },
        },
    },
    "cambridge-10|test-2": {
        part3: {
            singleChoice: {
                instruction: "Choose the correct letter, A, B or C.",
                questions: [
                    {
                        qNum: 25,
                        text: "According to Victor and Olivia, academics thought that Polynesian migration from the east was impossible due to",
                        options: [
                            {
                                letter: "A",
                                text: "the fact that Eastern countries were far away.",
                            },
                            {
                                letter: "B",
                                text: "the lack of materials for boat building.",
                            },
                            {
                                letter: "C",
                                text: "the direction of the winds and currents.",
                            },
                        ],
                    },
                    {
                        qNum: 26,
                        text: "Which do the speakers agree was the main reason for Heyerdahl's raft journey?",
                        options: [
                            { letter: "A", text: "to overcome a research setback" },
                            { letter: "B", text: "to demonstrate a personal quality" },
                            { letter: "C", text: "to test a new theory" },
                        ],
                    },
                    {
                        qNum: 27,
                        text: "What was most important to Heyerdahl about his raft journey?",
                        options: [
                            {
                                letter: "A",
                                text: "the fact that he was the first person to do it",
                            },
                            { letter: "B", text: "the speed of crossing the Pacific" },
                            {
                                letter: "C",
                                text: "the use of authentic construction methods",
                            },
                        ],
                    },
                    {
                        qNum: 28,
                        text: "Why did Heyerdahl go to Easter Island?",
                        options: [
                            { letter: "A", text: "to build a stone statue" },
                            { letter: "B", text: "to sail a reed boat" },
                            { letter: "C", text: "to learn the local language" },
                        ],
                    },
                    {
                        qNum: 29,
                        text: "In Olivia's opinion, Heyerdahl's greatest influence was on",
                        options: [
                            { letter: "A", text: "theories about Polynesian origins." },
                            {
                                letter: "B",
                                text: "the development of archaeological methodology.",
                            },
                            {
                                letter: "C",
                                text: "establishing archaeology as an academic subject.",
                            },
                        ],
                    },
                    {
                        qNum: 30,
                        text: "Which criticism do the speakers make of William Oliver's textbook?",
                        options: [
                            { letter: "A", text: "Its style is out of date." },
                            { letter: "B", text: "Its content is over-simplified." },
                            { letter: "C", text: "Its methodology is flawed." },
                        ],
                    },
                ],
            },
        },
    },
    "cambridge-12|test-3": {
        part3: {
            matching: {
                instruction: "Complete the flow-chart below. Choose SIX answers from the box and write the correct letter, A-H, next to Questions 21-26.",
                options: [
                    { letter: "A", text: "patterns" },
                    { letter: "B", text: "names" },
                    { letter: "C", text: "sources" },
                    { letter: "D", text: "questions" },
                    { letter: "E", text: "employees" },
                    { letter: "F", text: "solutions" },
                    { letter: "G", text: "headings" },
                    { letter: "H", text: "officials" },
                ],
                items: [
                    {
                        qNum: 21,
                        text: "Locate and read relevant articles, noting key information and also ___",
                    },
                    {
                        qNum: 22,
                        text: "Select interviewees – these may be site ___",
                    },
                    { qNum: 23, text: "… visitors or city ___" },
                    {
                        qNum: 24,
                        text: "Check whether ___ of interviewees can be used.",
                    },
                    {
                        qNum: 25,
                        text: "Select relevant information and try to identify ___",
                    },
                    { qNum: 26, text: "Do NOT end with ___" },
                ],
            },
        },
    },
    "cambridge-12|test-4": {
        part3: {
            notesCompletion: {
                instruction: "Complete the table below.",
                instructionSub: "Write ONE WORD ONLY for each answer.",
                sections: [
                    {
                        title: "Presentation of film adaptations of Shakespeare's plays",
                        content: [
                            {
                                text: "Introduce Giannetti's book containing a ",
                            },
                            { blank: 21 },
                            {
                                text: " of adaptations (work still to do: organise notes).\nAsk class to suggest the ",
                            },
                            { blank: 22 },
                            {
                                text: " adaptations.\nPresent Rachel Malchow's ideas — prepare some ",
                            },
                            { blank: 23 },
                            {
                                text: ".\nDiscuss relationship between adaptations and ",
                            },
                            { blank: 24 },
                            { text: " at the time of making the film." },
                        ],
                    },
                ],
            },
            matching: {
                instruction: "What do the speakers say about each of the following films? Choose SIX answers from the box and write the correct letter, A-G, next to Questions 25-30.",
                options: [
                    { letter: "A", text: "clearly shows the historical period" },
                    { letter: "B", text: "contains only parts of the play" },
                    { letter: "C", text: "is too similar to another kind of film" },
                    { letter: "D", text: "turned out to be unpopular with audiences" },
                    {
                        letter: "E",
                        text: "presents the play in a different period from the original",
                    },
                    { letter: "F", text: "sets the original in a different country" },
                    { letter: "G", text: "incorporates a variety of art forms" },
                ],
                items: [
                    { qNum: 25, text: "Ran" },
                    { qNum: 26, text: "Much Ado About Nothing" },
                    { qNum: 27, text: "Romeo & Juliet" },
                    { qNum: 28, text: "Hamlet" },
                    { qNum: 29, text: "Prospero's Books" },
                    { qNum: 30, text: "Looking for Richard" },
                ],
            },
        },
    },
    "cambridge-13|test-1": {
        part3: {
            matching: {
                instruction: "Complete the flow-chart below. Choose FIVE answers from the box and write the correct letter, A-H, next to Questions 26-30.",
                options: [
                    { letter: "A", text: "container" },
                    { letter: "B", text: "soil" },
                    { letter: "C", text: "weight" },
                    { letter: "D", text: "condition" },
                    { letter: "E", text: "height" },
                    { letter: "F", text: "colour" },
                    { letter: "G", text: "types" },
                    { letter: "H", text: "depths" },
                ],
                items: [
                    { qNum: 26, text: "Select seeds of different ___ and sizes." },
                    { qNum: 27, text: "Measure and record the ___ and size of each one." },
                    { qNum: 28, text: "Decide on the ___ to be used." },
                    { qNum: 29, text: "Use a different ___ for each seed and label it." },
                    { qNum: 30, text: "After about 3 weeks, record the plant's ___." },
                ],
            },
        },
    },
    "cambridge-11|test-2": {
        part3: {
            chooseTwoBlocks: [
                {
                    instruction: "Choose TWO letters, A-E.",
                    question: "Which TWO problems affecting organisms in the splash zone are mentioned?",
                    options: [
                        { letter: "A", text: "lack of water" },
                        { letter: "B", text: "strong winds" },
                        { letter: "C", text: "lack of food" },
                        { letter: "D", text: "high temperatures" },
                        { letter: "E", text: "large waves" },
                    ],
                    qNums: [27, 28],
                },
                {
                    instruction: "Choose TWO letters, A-E.",
                    question: "Which TWO reasons for possible error will they include in their report?",
                    options: [
                        {
                            letter: "A",
                            text: "inaccurate records of the habitat of organisms",
                        },
                        {
                            letter: "B",
                            text: "influence on behaviour of organisms by observer",
                        },
                        {
                            letter: "C",
                            text: "incorrect identification of some organisms",
                        },
                        {
                            letter: "D",
                            text: "making generalisations from a small sample",
                        },
                        { letter: "E", text: "missing some organisms when counting" },
                    ],
                    qNums: [29, 30],
                },
            ],
        },
    },
    "cambridge-16|test-2": {
        part3: {
            notesCompletion: {
                instruction: "Complete the flow chart below.",
                instructionSub: "Write ONE WORD ONLY for each answer.",
                sections: [
                    {
                        title: "Assignment plan",
                        content: [
                            {
                                text: "Research question: Is there a relationship between hours of sleep and number of dreams?\n\nSample: Twelve students from the ",
                            },
                            { blank: 25 },
                            { text: " department.\n\nMethodology: Self-reporting.\n\nProcedure: Answers on " },
                            { blank: 26 },
                            {
                                text: ".\n\nCheck ethical guidelines for working with ",
                            },
                            { blank: 27 },
                            {
                                text: ". Ensure that risk is assessed and ",
                            },
                            { blank: 28 },
                            {
                                text: " is kept to a minimum.\n\nAnalyse the results: Calculate the correlation and make a ",
                            },
                            { blank: 29 },
                            { text: ".\n\n" },
                            { blank: 30 },
                            { text: " the research" },
                        ],
                    },
                ],
            },
        },
    },
};
