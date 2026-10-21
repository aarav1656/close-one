// The 30 NBA teams with ESPN's abbreviations (what the scoreboard returns), for the app's team picker.
const T = (abbr, city, nick) => ({abbr, city, nick, name: `${city} ${nick}`});
export const TEAMS = [
  T('ATL', 'Atlanta', 'Hawks'), T('BOS', 'Boston', 'Celtics'), T('BKN', 'Brooklyn', 'Nets'),
  T('CHA', 'Charlotte', 'Hornets'), T('CHI', 'Chicago', 'Bulls'), T('CLE', 'Cleveland', 'Cavaliers'),
  T('DAL', 'Dallas', 'Mavericks'), T('DEN', 'Denver', 'Nuggets'), T('DET', 'Detroit', 'Pistons'),
  T('GS', 'Golden State', 'Warriors'), T('HOU', 'Houston', 'Rockets'), T('IND', 'Indiana', 'Pacers'),
  T('LAC', 'LA', 'Clippers'), T('LAL', 'Los Angeles', 'Lakers'), T('MEM', 'Memphis', 'Grizzlies'),
  T('MIA', 'Miami', 'Heat'), T('MIL', 'Milwaukee', 'Bucks'), T('MIN', 'Minnesota', 'Timberwolves'),
  T('NO', 'New Orleans', 'Pelicans'), T('NY', 'New York', 'Knicks'), T('OKC', 'Oklahoma City', 'Thunder'),
  T('ORL', 'Orlando', 'Magic'), T('PHI', 'Philadelphia', '76ers'), T('PHX', 'Phoenix', 'Suns'),
  T('POR', 'Portland', 'Trail Blazers'), T('SAC', 'Sacramento', 'Kings'), T('SA', 'San Antonio', 'Spurs'),
  T('TOR', 'Toronto', 'Raptors'), T('UTAH', 'Utah', 'Jazz'), T('WSH', 'Washington', 'Wizards'),
];
export const TEAM_ABBRS = new Set(TEAMS.map(t => t.abbr));
