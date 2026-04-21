ROMANIAN_FIRST_NAMES = {
    # Male
    'Ioan', 'Ion', 'Ionel', 'Ionuț', 'Gheorghe', 'Gheorghiță', 'Vasile',
    'Dumitru', 'Mihai', 'Mihail', 'Alexandru', 'Alexandu', 'Alex',
    'Constantin', 'Costel', 'Costică', 'Andrei', 'Adrian', 'Aurel',
    'Lucian', 'Victor', 'Vlad', 'Vladimir', 'Stefan', 'Ștefan',
    'Bogdan', 'Cristian', 'Cristi', 'Cătălin', 'Claudiu', 'Corneliu',
    'Daniel', 'Dănuț', 'David', 'Florin', 'Florian', 'Gabriel',
    'Gavril', 'George', 'Sorin', 'Sergiu', 'Silviu', 'Radu',
    'Raul', 'Rafael', 'Razvan', 'Răzvan', 'Robert', 'Romulus',
    'Octavian', 'Octav', 'Pavel', 'Petru', 'Petre', 'Petrică',
    'Nicolae', 'Nicu', 'Nicusor', 'Liviu', 'Laurentiu', 'Lăcrămioara',
    'Marius', 'Marcel', 'Mircea', 'Mirel', 'Marian', 'Marin',
    'Tudor', 'Traian', 'Tiberiu', 'Dorin', 'Dorel', 'Dorinel',
    'Cezar', 'Ciprian', 'Crisitan', 'Emanuel', 'Emilian', 'Eugen',
    'Horia', 'Horatiu', 'Ilie', 'Iulian', 'Iuliu', 'Iustin',
    'Mihnea', 'Valentin', 'Vali', 'Viorel', 'Virgil', 'Zaharia',
    'Rares', 'Remus', 'Relu', 'Sabin', 'Sandu', 'Sorica',
    'Pârvu', 'Pirvu', 'Deaconu', 'Ioniță',
    # Female
    'Maria', 'Ana', 'Elena', 'Ioana', 'Cristina', 'Andreea',
    'Alexandra', 'Alina', 'Alin', 'Adela', 'Adina', 'Adriana',
    'Beatrice', 'Bianca', 'Camelia', 'Carmen', 'Claudia', 'Corina',
    'Dana', 'Daniela', 'Diana', 'Doina', 'Elena', 'Elisabeta',
    'Florentina', 'Gabriela', 'Georgiana', 'Irina', 'Larisa', 'Laura',
    'Lavinia', 'Lidia', 'Liliana', 'Luminița', 'Magda', 'Magdalena',
    'Mariana', 'Marina', 'Mihaela', 'Monica', 'Nicoleta', 'Oana',
    'Raluca', 'Ramona', 'Roxana', 'Simona', 'Silvia', 'Sorina',
    'Teodora', 'Valentina', 'Veronica', 'Victoria', 'Violeta', 'Viorica',
}

ROMANIAN_LAST_NAMES = {
    'Popescu', 'Ionescu', 'Popa', 'Gheorghe', 'Gheorghiu', 'Vasile',
    'Vasilescu', 'Dumitru', 'Dumitrescu', 'Mihai', 'Mihailescu',
    'Stoica', 'Stoicescu', 'Stanescu', 'Stan', 'Stanciu',
    'Constantin', 'Constantinescu', 'Marin', 'Marinescu', 'Marcu',
    'Petrescu', 'Petcu', 'Petre', 'Petrică', 'Pribeanu',
    'Radu', 'Radulescu', 'Roman', 'Romanescu', 'Rosca',
    'Nistor', 'Niculescu', 'Neagu', 'Negru', 'Negrea',
    'Oprea', 'Oprescu', 'Olteanu', 'Oltean', 'Oancea',
    'Ionita', 'Ioniță', 'Ionica', 'Iordache', 'Iorga',
    'Luca', 'Lupu', 'Lupas', 'Lupescu', 'Lazar',
    'Matei', 'Mateescu', 'Mitrea', 'Mitrescu', 'Moldovan',
    'Moldoveanu', 'Morariu', 'Moraru', 'Mocanu', 'Moise',
    'Balan', 'Balasa', 'Barbu', 'Barbulescu', 'Baciu',
    'Badea', 'Badescu', 'Bogdan', 'Botan', 'Bucur',
    'Chiriac', 'Chirita', 'Cojocaru', 'Coman', 'Cosma',
    'Cristea', 'Cristescu', 'Cucu', 'Dobre', 'Dobrescu',
    'Dima', 'Dinu', 'Dincu', 'Dragomir', 'Dragomirescu',
    'Enache', 'Enescu', 'Florescu', 'Florea', 'Fota',
    'Gheorgiu', 'Ghita', 'Grigore', 'Grigorescu', 'Grigoras',
    'Apostol', 'Alexandrescu', 'Angelescu', 'Avram', 'Albu',
    'Serban', 'Sandu', 'Sabau', 'Rusu', 'Rus',
    'Turcu', 'Tudor', 'Todoran', 'Toma', 'Tomescu',
    'Ungureanu', 'Ungurean', 'Ursu', 'Vlad', 'Vladescu',
    'Zamfir', 'Zamfirescu', 'Zaharia', 'Zaman',
    'Faraoanu', 'Agapie', 'Barascu', 'Dina', 'Pirvu',
    'Deaconu', 'Ivanescu', 'Grigoras', 'Racoveanu', 'Poroane',
    'Theodorescu', 'Avramescu', 'Ivanescu',
}

EXCLUDE_WORDS = {
    # Greetings
    'Bună', 'Buna', 'Bun', 'Salut', 'Alo', 'Hei', 'Hello',
    'Noapte', 'Dimineată', 'Dimineața', 'Seara', 'Seară', 'Prânz', 'Pranz',
    # Days
    'Luni', 'Marți', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Sambata', 'Duminică', 'Duminica',
    # Months
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
    # Brands / Companies
    'Vodafone', 'Vodafon', 'Orange', 'Telekom', 'Digi', 'RCS', 'RDS',
    'Samsung', 'Apple', 'Xiaomi', 'Huawei', 'Nokia', 'iPhone',
    'Carrefour', 'Kaufland', 'Lidl', 'Mega', 'Cora', 'Auchan',
    'Google', 'Facebook', 'Youtube', 'WhatsApp', 'Zoom',
    # Common capitalized words
    'Da', 'Nu', 'Ok', 'Okay', 'Bine', 'Deci', 'Daca', 'Dacă',
    'Domnule', 'Doamnă', 'Doamna', 'Domnișoară', 'Domn',
    'Problema', 'Soluție', 'Solutia', 'Serviciu', 'Agenție', 'Agentie',
    'Abonament', 'Contract', 'Ofertă', 'Oferta', 'Reducere',
    'Internet', 'Telefon', 'Număr', 'Numar', 'Rețea', 'Retea',
    'Stefan', 'Ștefan',  # Common name used as address mid-call
}
