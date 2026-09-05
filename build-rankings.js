// Regenerates rankings.js. Run: node build-rankings.js
// Base consensus ranks compiled Sept 2026 from FantasyPros/ESPN(Yates,Clay)/FTN(Ratcliffe)/Yahoo/RotoBaller/FFC.
// [rank, name, team, pos, tier, note]
const BASE = [
[1,"Jahmyr Gibbs","DET","RB",1,""],[2,"Bijan Robinson","ATL","RB",1,""],[3,"Ja'Marr Chase","CIN","WR",1,""],
[4,"Puka Nacua","LAR","WR",1,"susp risk"],[5,"Jaxon Smith-Njigba","SEA","WR",1,""],[6,"Christian McCaffrey","SF","RB",1,"age fade"],
[7,"Jonathan Taylor","IND","RB",1,""],[8,"Amon-Ra St. Brown","DET","WR",1,""],[9,"De'Von Achane","MIA","RB",1,""],
[10,"James Cook","BUF","RB",2,""],[11,"Justin Jefferson","MIN","WR",1,""],[12,"CeeDee Lamb","DAL","WR",2,""],
[13,"Saquon Barkley","PHI","RB",2,""],[14,"Derrick Henry","BAL","RB",2,"age fade"],[15,"Chase Brown","CIN","RB",2,""],
[16,"Kenneth Walker","KC","RB",2,""],[17,"Brock Bowers","LV","TE",1,""],[18,"Drake London","ATL","WR",2,""],
[19,"Trey McBride","ARI","TE",1,""],[20,"Rashee Rice","KC","WR",2,""],[21,"Jeremiyah Love","ARI","RB",3,"rookie"],
[22,"Ashton Jeanty","LV","RB",3,""],[23,"Omarion Hampton","LAC","RB",3,""],[24,"Josh Allen","BUF","QB",1,""],
[25,"Malik Nabers","NYG","WR",2,"injury"],[26,"Nico Collins","HOU","WR",2,""],[27,"A.J. Brown","NE","WR",2,""],
[28,"Javonte Williams","DAL","RB",3,""],[29,"Chris Olave","NO","WR",3,""],[30,"George Pickens","DAL","WR",3,""],
[31,"Breece Hall","NYJ","RB",3,""],[32,"Kyren Williams","LAR","RB",3,""],[33,"Travis Etienne","JAX","RB",4,""],
[34,"Emeka Egbuka","TB","WR",3,""],[35,"Garrett Wilson","NYJ","WR",3,""],[36,"Lamar Jackson","BAL","QB",2,""],
[37,"Colston Loveland","CHI","TE",2,""],[38,"Quinshon Judkins","CLE","RB",4,"bust risk"],[39,"D'Andre Swift","CHI","RB",4,""],
[40,"Tetairoa McMillan","CAR","WR",3,""],[41,"Jayden Daniels","WAS","QB",2,""],[42,"Zay Flowers","BAL","WR",3,""],
[43,"DeVonta Smith","PHI","WR",3,""],[44,"Jaylen Waddle","MIA","WR",3,""],[45,"Cam Skattebo","NYG","RB",4,"bust risk"],
[46,"Tyler Warren","IND","TE",2,""],[47,"Bucky Irving","TB","RB",4,""],[48,"Drake Maye","NE","QB",2,""],
[49,"Bhayshul Tuten","JAX","RB",4,"sleeper"],[50,"Davante Adams","LAR","WR",4,"age fade"],[51,"Ladd McConkey","LAC","WR",4,""],
[52,"Harold Fannin","CLE","TE",2,""],[53,"Tee Higgins","CIN","WR",4,""],[54,"Jadarian Price","SEA","RB",5,"rookie"],
[55,"Josh Jacobs","GB","RB",5,""],[56,"David Montgomery","HOU","RB",5,""],[57,"Terry McLaurin","WAS","WR",4,""],
[58,"Mike Evans","SF","WR",4,"bust risk"],[59,"Justin Herbert","LAC","QB",3,""],[60,"Carnell Tate","TEN","WR",4,"rookie"],
[61,"Kyle Pitts","ATL","TE",3,""],[62,"Rhamondre Stevenson","NE","RB",5,""],[63,"Tony Pollard","TEN","RB",5,""],
[64,"George Kittle","SF","TE",3,"age fade"],[65,"Chuba Hubbard","CAR","RB",5,""],[66,"TreVeyon Henderson","NE","RB",5,""],
[67,"Rome Odunze","CHI","WR",4,"sleeper"],[68,"DK Metcalf","PIT","WR",4,""],[69,"Tucker Kraft","GB","TE",3,"injury"],
[70,"Kenneth Gainwell","TB","RB",6,""],[71,"Jaxson Dart","NYG","QB",3,""],[72,"Jaylen Warren","PIT","RB",6,""],
[73,"DJ Moore","BUF","WR",4,""],[74,"Joe Burrow","CIN","QB",3,""],[75,"Marvin Harrison","ARI","WR",4,""],
[76,"Jalen Hurts","PHI","QB",3,""],[77,"Trevor Lawrence","JAX","QB",3,""],[78,"Christian Watson","GB","WR",5,""],
[79,"Luther Burden","CHI","WR",5,"sleeper"],[80,"Jameson Williams","DET","WR",5,""],[81,"Parker Washington","JAX","WR",5,""],
[82,"Sam LaPorta","DET","TE",3,""],[83,"Travis Hunter","JAX","WR",5,""],[84,"Xavier Worthy","KC","WR",5,""],
[85,"Makai Lemon","PHI","WR",5,"rookie"],[86,"Isaac Guerendo","SF","RB",6,""],[87,"Braelon Allen","NYJ","RB",6,""],
[88,"Jerry Jeudy","CLE","WR",5,""],[89,"Dak Prescott","DAL","QB",3,""],[90,"Patrick Mahomes","KC","QB",3,""],
[91,"Jayden Reed","GB","WR",5,""],[92,"Jake Ferguson","DAL","TE",4,""],[93,"Keon Coleman","BUF","WR",6,""],
[94,"Tre Harris","LAC","WR",6,"sleeper"],[95,"MarShawn Lloyd","GB","RB",6,""],[96,"Brock Purdy","SF","QB",4,""],
[97,"Matthew Stafford","LAR","QB",4,""],[98,"Bo Nix","DEN","QB",4,""],[99,"Travis Kelce","KC","TE",4,"age fade"],
[100,"Jared Goff","DET","QB",4,""],[101,"Kyle Monangai","CHI","RB",6,""],[102,"Jonathon Brooks","CAR","RB",6,"injury"],
[103,"Chris Godwin","TB","WR",6,""],[104,"Matthew Golden","GB","WR",6,""],[105,"Alec Pierce","IND","WR",6,""],
[106,"Josh Downs","IND","WR",6,"sleeper"],[107,"Caleb Williams","CHI","QB",4,""],[108,"Brian Thomas","JAX","WR",6,"bust risk"],
[109,"De'Zhaun Stribling","SF","WR",6,"rookie"],[110,"J.K. Dobbins","DEN","RB",7,""],[111,"RJ Harvey","DEN","RB",7,""],
[112,"Jacory Croskey-Merritt","WAS","RB",7,""],[113,"Jordan Love","GB","QB",4,""],[114,"Daniel Jones","IND","QB",4,""],
[115,"Rico Dowdle","PIT","RB",7,""],[116,"Blake Corum","LAR","RB",7,""],[117,"Jordan Addison","MIN","WR",6,""],
[118,"Wan'Dale Robinson","TEN","WR",6,""],[119,"Romeo Doubs","NE","WR",6,""],[120,"Stefon Diggs","WAS","WR",6,""],
[121,"Juwan Johnson","NO","TE",4,""],[122,"Hunter Henry","NE","TE",4,""],[123,"Jalen Coker","CAR","WR",7,"sleeper"],
[124,"Dalton Schultz","HOU","TE",4,""],[125,"Tyler Shough","NO","QB",5,""],[126,"Tyjae Spears","TEN","RB",7,"sleeper"],
[127,"Zach Charbonnet","SEA","RB",7,"injury"],[128,"Woody Marks","HOU","RB",7,"sleeper"],[129,"Khalil Shakir","BUF","WR",7,""],
[130,"Jordan Mason","MIN","RB",7,""],[131,"Isaiah Likely","NYG","TE",4,"sleeper"],[132,"Kyler Murray","MIN","QB",5,""],
[133,"Deebo Samuel","WAS","WR",7,""],[134,"Tyrone Tracy","NYG","RB",8,""],[135,"Alvin Kamara","NO","RB",8,"age fade"],
[136,"Michael Pittman","IND","WR",7,""],[137,"Courtland Sutton","DEN","WR",7,""],[138,"Calvin Ridley","TEN","WR",7,""],
[139,"Jakobi Meyers","LV","WR",7,""],[140,"Ollie Gordon","MIA","RB",8,""],[141,"Ray Davis","BUF","RB",8,""],
[142,"T.J. Hockenson","MIN","TE",5,""],[143,"Mark Andrews","BAL","TE",5,"age fade"],[144,"Evan Engram","DEN","TE",5,""],
[145,"C.J. Stroud","HOU","QB",5,""],[146,"Tua Tagovailoa","MIA","QB",5,""],[147,"Justin Fields","NYJ","QB",5,""],
[148,"Ricky Pearsall","SF","WR",7,""],[149,"Jauan Jennings","MIN","WR",7,""],[150,"Rashid Shaheed","NO","WR",8,""],
[151,"Cooper Kupp","SEA","WR",8,"age fade"],[152,"Jaylin Noel","HOU","WR",8,""],[153,"Jayden Higgins","HOU","WR",8,""],
[154,"Keenan Allen","IND","WR",8,"age fade"],[155,"Marvin Mims","DEN","WR",8,""],[156,"Tyler Allgeier","ARI","RB",8,""],
[157,"Isiah Pacheco","KC","RB",8,""],[158,"Kaleb Johnson","PIT","RB",8,""],[159,"Devin Neal","NO","RB",8,"sleeper"],
[160,"Dylan Sampson","CLE","RB",8,"sleeper"],[161,"Ja'Kobi Lane","BAL","WR",8,"rookie"],[162,"Jack Bech","LV","WR",8,"sleeper"],
[163,"Tyreek Hill","FA","WR",8,"injury"],[164,"Cedric Tillman","CLE","WR",8,""],[165,"Darnell Mooney","ATL","WR",8,""],
[166,"Michael Wilson","ARI","WR",9,""],[167,"Dont'e Thornton","LV","WR",9,"sleeper"],[168,"Kyle Williams","NE","WR",9,""],
[169,"Tory Horton","SEA","WR",9,"sleeper"],[170,"Xavier Legette","CAR","WR",9,""],[171,"Brandon Aiyuk","SF","WR",9,"injury"],
[172,"Mason Taylor","NYJ","TE",5,""],[173,"Elijah Arroyo","SEA","TE",5,""],[174,"Oronde Gadsden","LAC","TE",5,"sleeper"],
[175,"Brenton Strange","JAX","TE",6,""],[176,"Chig Okonkwo","TEN","TE",6,""],[177,"Cade Otton","TB","TE",6,""],
[178,"Ja'Tavion Sanders","CAR","TE",6,""],[179,"Michael Penix","ATL","QB",6,"injury"],[180,"Bryce Young","CAR","QB",6,""],
[181,"Sam Darnold","SEA","QB",6,""],[182,"Jaydon Blue","DAL","RB",9,""],[183,"Kimani Vidal","LAC","RB",9,""],
[184,"Jalen McMillan","TB","WR",9,""],[185,"Quentin Johnston","LAC","WR",9,""],[186,"Joshua Palmer","BUF","WR",9,""],
[187,"Troy Franklin","DEN","WR",9,""],[188,"Calvin Austin","PIT","WR",9,""],[189,"Adonai Mitchell","NYJ","WR",9,""],
[190,"Keaton Mitchell","BAL","RB",9,"sleeper"],[191,"Brashard Smith","KC","RB",9,"sleeper"],[192,"Terrance Ferguson","LAR","TE",6,""],
[193,"Jaylen Wright","MIA","RB",9,""],[194,"Elic Ayomanor","TEN","WR",9,""],[195,"Pat Bryant","DEN","WR",9,""],
[196,"Dontayvion Wicks","GB","WR",9,""],[197,"Kendre Miller","NO","RB",9,""],[198,"Roschon Johnson","CHI","RB",9,""],
[199,"Luke McCaffrey","WAS","WR",9,""],[200,"Savion Williams","GB","WR",9,""],
];

// Real ADP intel where we have it (12-team PPR, early Sept 2026). Others derived below.
const ADP = {
  "Jahmyr Gibbs":1,"Bijan Robinson":2,"Ja'Marr Chase":3,"Christian McCaffrey":4,"Puka Nacua":5,
  "Jaxon Smith-Njigba":6,"Amon-Ra St. Brown":7,"Jonathan Taylor":8,"Justin Jefferson":9,"De'Von Achane":10,
  "James Cook":12,"Saquon Barkley":13,"Derrick Henry":14,"CeeDee Lamb":15,"Kenneth Walker":16,
  "Chase Brown":17,"Drake London":18,"Nico Collins":19,"Omarion Hampton":20,"Ashton Jeanty":22,
  "Brock Bowers":23,"Rashee Rice":24,"Jeremiyah Love":25,"Trey McBride":26,"Malik Nabers":28,
  "Zay Flowers":29,"Josh Allen":30,"DeVonta Smith":31,"Kyren Williams":30,"Tee Higgins":32,
  "Garrett Wilson":33,"A.J. Brown":34,"Breece Hall":35,"Lamar Jackson":38,"Emeka Egbuka":40,
  "Ladd McConkey":42,"Terry McLaurin":43,"Jameson Williams":44,"Jaylen Waddle":45,"Brian Thomas":46,
  "Chris Godwin":47,"DK Metcalf":48,"D'Andre Swift":49,"Quinshon Judkins":50,"Jayden Daniels":52,
  "Drake Maye":53,"Davante Adams":54,"Joe Burrow":55,"Rome Odunze":56,"Cam Skattebo":57,
  "Christian Watson":58,"Kyler Murray":62,"Caleb Williams":63,"Jalen Hurts":64,"George Kittle":65,
  "Josh Downs":66,"Carnell Tate":68,"Bhayshul Tuten":70,"Jordan Mason":72,"Jonathon Brooks":74,
  "Dak Prescott":104,"Isaiah Likely":118,"De'Zhaun Stribling":122,"Makai Lemon":126,
};

const UPSIDE = { // explicit overrides; others derived
  "Jahmyr Gibbs":5,"Bijan Robinson":5,"Ja'Marr Chase":5,"Puka Nacua":5,"Justin Jefferson":5,
  "De'Von Achane":5,"Ashton Jeanty":5,"Jeremiyah Love":5,"Malik Nabers":5,"Brock Bowers":5,
  "Josh Allen":5,"Jayden Daniels":5,"Drake Maye":5,"Bhayshul Tuten":5,"Lamar Jackson":5,
  "Christian McCaffrey":4,"Davante Adams":2,"Travis Kelce":2,"Alvin Kamara":2,"Cooper Kupp":2,
  "Keenan Allen":2,"Mike Evans":2,"Tyreek Hill":5,"Oronde Gadsden":5,"Keaton Mitchell":5,
  "Brandon Aiyuk":4,"Jack Bech":4,"Ja'Kobi Lane":4,"Tory Horton":4,"Dont'e Thornton":4,
};
const BUST = { // explicit overrides
  "Jahmyr Gibbs":1,"Bijan Robinson":1,"Ja'Marr Chase":1,"Justin Jefferson":1,"Amon-Ra St. Brown":1,
  "Christian McCaffrey":4,"Puka Nacua":3,"Quinshon Judkins":5,"Cam Skattebo":5,"Davante Adams":5,
  "Mike Evans":4,"Brian Thomas":4,"Omarion Hampton":4,"Malik Nabers":4,"Jeremiyah Love":4,
  "Josh Allen":1,"Brock Bowers":1,"Trey McBride":1,"Tyreek Hill":5,"Jonathon Brooks":4,
};

function derive(rank, name, team, pos, tier, note) {
  let upside = UPSIDE[name];
  if (upside == null) {
    upside = rank <= 10 ? 5 : rank <= 30 ? 4 : 3;
    if (/rookie|sleeper/.test(note)) upside = Math.min(5, upside + 2);
    if (/age fade/.test(note)) upside = 2;
    if (rank > 130 && !/rookie|sleeper/.test(note)) upside = 3;
  }
  let bust = BUST[name];
  if (bust == null) {
    bust = rank <= 15 ? 2 : rank <= 60 ? 3 : 3;
    if (/bust risk/.test(note)) bust = 5;
    else if (/age fade|injury|susp/.test(note)) bust = 4;
    else if (/rookie/.test(note)) bust = 4;
    else if (/sleeper/.test(note)) bust = 4;
  }
  let adp = ADP[name];
  if (adp == null) {
    // Single-QB rooms let QBs slide; TEs past the elite tier slide too. Otherwise ADP tracks rank.
    const slide = pos === "QB" ? 10 : pos === "TE" && tier >= 3 ? 6 : /rookie|sleeper/.test(note) ? 5 : 0;
    adp = Math.min(240, rank + slide);
  }
  return { rank, name, team, pos, tier, adp, upside, bust, note };
}

const out = BASE.map(r => derive(...r));
const lines = out.map(p => "  " + JSON.stringify(p).replace(/"([a-z]+)":/g, "$1:"));
const header = `// GENERATED by build-rankings.js — do not hand-edit; edit the builder instead.
// Consensus Sept 2026 (FantasyPros / ESPN Yates+Clay / FTN Ratcliffe / Yahoo / RotoBaller / FFC).
// rank = consensus overall, adp = approx 12-team PPR ADP, upside/bust = 1-5, tier = positional.
// Teams are auto-corrected at runtime against Sleeper's player database.
window.RANKINGS = [\n`;
require("fs").writeFileSync(__dirname + "/rankings.js", header + lines.join(",\n") + "\n];\n");
console.log("wrote rankings.js with", out.length, "players");
