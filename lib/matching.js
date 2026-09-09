// lib/matching.js — Text normalization, duplicate detection, similarity scoring

// Persian/Arabic character normalization map
var CHAR_MAP = {
  '\u06cc': '\u064a', // Persian ye (U+06CC) -> Arabic ye (U+064A)
  '\u0643': '\u0643', // already Arabic kaf, keep
  '\u06a9': '\u0643', // Persian kaf (U+06A9) -> Arabic kaf (U+0643)
  '\u0647\u200d': '\u0647', // heh + ZWJ -> heh
  '\u0629\u200e': '\u0647', // ta marbuta + LTR mark -> heh
  '\u0629': '\u0647', // ta marbuta -> heh
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
  '\u06f0': '0', '\u06f1': '1', '\u06f2': '2', '\u06f3': '3', '\u06f4': '4',
  '\u06f5': '5', '\u06f6': '6', '\u06f7': '7', '\u06f8': '8', '\u06f9': '9'
};

// Characters to strip
var STRIP_CHARS = [
  '\u200c', // zero-width non-joiner
  '\u200d', // zero-width joiner
  '\u200e', // left-to-right mark
  '\u200f', // right-to-left mark
  '\u200b', // zero-width space
  '\u200a', // hair space
  '\u2009', // thin space
  '\u2008', // punctuation space
  '\u2007', // figure space
  '\u2006', // six-per-em space
  '\u2005', // four-per-em space
  '\u2004', // three-per-em space
  '\ufeff', // BOM
  '\ufff9', // interlinear annotation anchor
  '\ufffa', // interlinear annotation separator
  '\ufffb'  // interlinear annotation terminator
];

function normalizeText(text) {
  if (!text) return '';
  var s = String(text);

  // Trim and collapse whitespace
  s = s.trim().replace(/\s+/g, ' ');

  // Apply character map
  var keys = Object.keys(CHAR_MAP);
  for (var i = 0; i < keys.length; i++) {
    s = s.split(keys[i]).join(CHAR_MAP[keys[i]]);
  }

  // Strip zero-width and invisible characters
  for (var j = 0; j < STRIP_CHARS.length; j++) {
    while (s.indexOf(STRIP_CHARS[j]) !== -1) {
      s = s.split(STRIP_CHARS[j]).join('');
    }
  }

  // Remove common Persian/Arabic diacritics (tashkeel)
  s = s.replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed]/g, '');

  // Normalize punctuation
  s = s.replace(/[\u060c\u060d]/g, ','); // Arabic comma -> comma
  s = s.replace(/[\u061b]/g, ';'); // Arabic semicolon -> semicolon
  s = s.replace(/[\u061f]/g, '?'); // Arabic question mark -> question mark

  // Lowercase (affects Latin characters if any)
  s = s.toLowerCase();

  return s;
}

// Levenshtein distance
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  var matrix = [];
  var i, j;
  for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
  for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }

  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      var cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j - 1] + cost,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1
      );
    }
  }
  return matrix[b.length][a.length];
}

// Similarity ratio (0 = identical, 1 = completely different)
function similarityRatio(a, b) {
  if (a === b) return 0;
  var maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a, b) / maxLen;
}

// Check if two texts are suspiciously similar
function isSuspiciouslySimilar(text1, text2, threshold) {
  threshold = threshold || 0.35;
  var n1 = normalizeText(text1);
  var n2 = normalizeText(text2);
  if (n1 === n2) return true; // exact match
  return similarityRatio(n1, n2) <= threshold;
}

// Find exact duplicate among existing courses
function findExactDuplicate(normalizedName, existingCourses) {
  for (var i = 0; i < existingCourses.length; i++) {
    if (existingCourses[i].normalized_name === normalizedName) {
      return existingCourses[i];
    }
  }
  return null;
}

// Find suspicious similar courses
function findSuspiciousCourses(normalizedName, existingCourses, threshold) {
  threshold = threshold || 0.35;
  var results = [];
  for (var i = 0; i < existingCourses.length; i++) {
    var ratio = similarityRatio(normalizedName, existingCourses[i].normalized_name);
    if (ratio > 0 && ratio < threshold) {
      results.push({ course: existingCourses[i], ratio: ratio });
    }
  }
  results.sort(function(a, b) { return a.ratio - b.ratio; });
  return results;
}

// Normalize URL for duplicate detection
function normalizeUrl(url) {
  if (!url) return '';
  var s = url.trim();
  // Remove trailing slashes
  while (s.charAt(s.length - 1) === '/') { s = s.slice(0, -1); }
  // Lowercase scheme and host
  var match = s.match(/^(https?:\/\/)([^\/]+)(.*)/i);
  if (match) {
    s = match[1].toLowerCase() + match[2].toLowerCase() + match[3];
  }
  return s;
}

// Normalize instructor name for comparison
function normalizeInstructor(name) {
  var n = normalizeText(name);
  // Remove common prefixes like dr, professor, etc.
  n = n.replace(/^(دکتر|دکترا|پروفسور|استاد|دکترا|dr\.?|prof\.?)\s+/i, '');
  return n.trim();
}

// Check if a partial instructor name could match an existing one
function matchInstructorPartial(partial, existingNames) {
  var normalized = normalizeInstructor(partial);
  // Exact normalized match
  for (var i = 0; i < existingNames.length; i++) {
    if (normalizeInstructor(existingNames[i]) === normalized) {
      return { type: 'exact', name: existingNames[i] };
    }
  }
  // Partial match (contains or is contained)
  var matches = [];
  for (var j = 0; j < existingNames.length; j++) {
    var en = normalizeInstructor(existingNames[j]);
    if (en.indexOf(normalized) !== -1 || normalized.indexOf(en) !== -1) {
      matches.push(existingNames[j]);
    }
  }
  if (matches.length === 1) {
    return { type: 'partial', name: matches[0] };
  }
  if (matches.length > 1) {
    return { type: 'ambiguous', names: matches };
  }
  return { type: 'none' };
}


export { normalizeText, normalizeUrl, normalizeInstructor, levenshtein, similarityRatio, isSuspiciouslySimilar, findExactDuplicate, findSuspiciousCourses, matchInstructorPartial };
