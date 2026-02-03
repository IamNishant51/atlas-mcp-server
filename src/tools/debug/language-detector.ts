/**
 * Language and Framework Detection Module
 */

// Language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  JavaScript: [/\.js/, /node/, /function\s*\(/, /=>\s*{/, /require\(/],
  TypeScript: [/\.ts/, /interface\s+/, /type\s+/, /<[A-Z]/],
  Python: [/\.py/, /def\s+/, /import\s+/, /from\s+.+\s+import/],
  Java: [/\.java/, /public\s+class/, /public\s+static/, /System\.out/],
  'C#': [/\.cs/, /using\s+System/, /public\s+class/, /namespace\s+/],
  Go: [/\.go/, /func\s+/, /package\s+main/, /import\s+\(/],
  Rust: [/\.rs/, /fn\s+/, /let\s+mut/, /impl\s+/],
  Ruby: [/\.rb/, /def\s+/, /end\s*$/, /require\s+/],
  PHP: [/\.php/, /<\?php/, /function\s+/, /\$\w+/],
};

// Framework detection patterns
const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  React: [/react/, /jsx/, /useState/, /useEffect/, /Component/],
  Vue: [/vue/, /\.vue/, /@vue/, /v-if/, /v-for/],
  Angular: [/angular/, /@angular/, /@Component/, /ngOnInit/],
  Express: [/express/, /app\.get/, /app\.post/, /req\./, /res\./],
  Django: [/django/, /models\.Model/, /render\(/, /HttpResponse/],
  Flask: [/flask/, /from flask/, /@app\.route/],
  'Spring Boot': [/springframework/, /@SpringBootApplication/, /@RestController/],
  'ASP.NET': [/System\.Web/, /Controller/, /ActionResult/],
  'Next.js': [/next/, /getServerSideProps/, /getStaticProps/],
};

/**
 * Detect programming language from content
 */
export function detectLanguage(content: string): string {
  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(content))) {
      return language;
    }
  }
  return 'Unknown';
}

/**
 * Detect framework from content
 */
export function detectFramework(content: string): string | undefined {
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(content))) {
      return framework;
    }
  }
  return undefined;
}

/**
 * Get language file extensions
 */
export function getLanguageExtensions(language: string): string[] {
  const extensions: Record<string, string[]> = {
    JavaScript: ['.js', '.jsx', '.mjs'],
    TypeScript: ['.ts', '.tsx'],
    Python: ['.py'],
    Java: ['.java'],
    'C#': ['.cs'],
    Go: ['.go'],
    Rust: ['.rs'],
    Ruby: ['.rb'],
    PHP: ['.php'],
  };
  
  return extensions[language] || [];
}
