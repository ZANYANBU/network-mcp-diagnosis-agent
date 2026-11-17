// Builds the 21CSC302J Computer Networks case study report for the Network MCP Diagnosis Agent.
//   node build_report.js          (needs the npm package "docx"; make_report.sh runs it twice for page numbers)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel,
  WidthType, ShadingType, BorderStyle, PageBreak, Footer, PageNumber, LevelFormat, NumberFormat, VerticalAlign,
} = require("docx");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");                       // cn-report/
const PROJ = fs.existsSync(path.join(ROOT, "..", "netdiag")) ? path.join(ROOT, "..") : path.join(ROOT, "..", "network-mcp");  // the project repository
const FONT = "Times New Roman";
const TW = 9026;                                           // A4 text width in DXA with 1-inch margins
const PAGES = process.env.TOC_PAGES ? JSON.parse(fs.readFileSync(process.env.TOC_PAGES, "utf8")) : {};
const pg = (key) => (PAGES[key] !== undefined ? String(PAGES[key]) : "");

const TEAM = [
  ["Basith Nistar", "RA2411003011771"],
  ["Y. Rupesh Reddy", "RA2411003011831"],
  ["Adhithyan K", "RA2411003011764"],
  ["B. Charith Reddy", "RA2411003011823"],
  ["V. Anbu Chelvan", "RA2411003011803"],
];
const FACULTY = { name: "Dr. Renuka Devi P", designation: "Assistant Professor" };
const TITLE1 = "Network MCP Server with a Diagnosis Agent:";
const TITLE2 = "Layer-by-Layer Fault Finding Verified in Cisco Packet Tracer";
const TITLE_UP = "NETWORK MCP SERVER WITH A DIAGNOSIS AGENT: LAYER-BY-LAYER FAULT FINDING VERIFIED IN CISCO PACKET TRACER";
const REPO_URL = "https://github.com/ZANYANBU/network-mcp-diagnosis-agent";

// ------------------------------------------------------------------ helpers
const run = (text, o = {}) => new TextRun({ text, font: o.font || FONT, size: o.size || 24, bold: o.bold, italics: o.italics });
const B = (t, o = {}) => run(t, { bold: true, ...o });
const I = (t, o = {}) => run(t, { italics: true, ...o });
const M = (t) => run(t, { font: "Courier New", size: 21 });
function P(content, o = {}) {
  const runs = (Array.isArray(content) ? content : [content]).map((c) => (typeof c === "string" ? run(c, o) : c));
  return new Paragraph({ children: runs, alignment: o.align || AlignmentType.JUSTIFIED, indent: o.indent, keepNext: o.keepNext,
    spacing: { line: o.line || 360, before: o.before || 0, after: o.after === undefined ? 160 : o.after } });
}
const C = (content, o = {}) => P(content, { align: AlignmentType.CENTER, line: 276, after: 60, ...o });
const PB = () => new Paragraph({ children: [new PageBreak()] });
const bullet = (content) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 336, after: 80 }, children: (Array.isArray(content) ? content : [content]).map((c) => (typeof c === "string" ? run(c) : c)) });
let listNo = 0;
const numbered = (content, ref) => new Paragraph({ numbering: { reference: ref, level: 0 }, alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 336, after: 80 }, children: (Array.isArray(content) ? content : [content]).map((c) => (typeof c === "string" ? run(c) : c)) });
const code = (src) => src.replace(/\s+$/, "").split("\n").map((line, i, all) => new Paragraph({
  shading: { fill: "F3F3F3", type: ShadingType.CLEAR, color: "auto" }, keepLines: true, keepNext: i < all.length - 1 && all.length < 40,
  spacing: { line: 240, before: i === 0 ? 80 : 0, after: i === all.length - 1 ? 200 : 0 }, indent: { left: 200, right: 200 },
  children: [new TextRun({ text: line.replace(/\t/g, "    ") || " ", font: "Courier New", size: 17 })] }));
const readProj = (rel, from, to) => { const l = fs.readFileSync(path.join(PROJ, rel), "utf8").split("\n"); return l.slice((from || 1) - 1, to || l.length).join("\n"); };

// headings: the contents table is built from these
const TOC = [];
let CH = 0, SEC = 0;
function chapter(n, title) {
  CH = n; SEC = 0; TOC.push({ no: String(n), title, key: `Chapter ${n}` });
  return [
    new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 60 }, heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `Chapter ${n}`, font: FONT, size: 32, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, keepNext: true,
      children: [new TextRun({ text: title, font: FONT, size: 32, bold: true })] }),
  ];
}
function unnumbered(title) {
  TOC.push({ no: "", title, key: title });
  return new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: title, font: FONT, size: 32, bold: true })] });
}
function H2(title) {
  const no = `${CH}.${++SEC}`; TOC.push({ no, title, key: `${no} ${title}` });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 280, after: 140 },
    children: [new TextRun({ text: `${no} ${title}`, font: FONT, size: 28, bold: true })] });
}
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 200, after: 100 },
  children: [new TextRun({ text: t, font: FONT, size: 24, bold: true })] });

// tables and figures, numbered per chapter and listed in the front matter
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NOB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NOBORDERS = { top: NOB, bottom: NOB, left: NOB, right: NOB };
function grid(rows, widths, o = {}) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0 && !o.noHeader, cantSplit: true,
      children: r.map((c, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA }, borders: o.noBorders ? NOBORDERS : BORDERS, verticalAlign: VerticalAlign.CENTER,
        shading: ri === 0 && !o.noHeader ? { fill: "D9E2F3", type: ShadingType.CLEAR, color: "auto" } : undefined,
        margins: { top: 50, bottom: 50, left: 100, right: 100 },
        children: String(c).split("\n").map((line) => new Paragraph({
          alignment: (o.center || []).includes(ci) ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { line: 252, after: 0 },
          children: [new TextRun({ text: line, font: (o.mono || []).includes(ci) && ri > 0 ? "Courier New" : FONT,
            size: (o.mono || []).includes(ci) && ri > 0 ? 18 : (o.size || 21), bold: (ri === 0 && !o.noHeader) || (o.boldCol === ci) })] })),
      })) })),
  });
}
const FIGS = [], TABS = [];
let fCount = {}, tCount = {};
function caption(kind, text) {
  const store = kind === "Figure" ? fCount : tCount;
  store[CH] = (store[CH] || 0) + 1;
  const no = `${CH}.${store[CH]}`;
  (kind === "Figure" ? FIGS : TABS).push({ no: `${kind} ${no}`, title: text, key: `${kind} ${no}: ${text.split(" ")[0]}` });
  return P([B(`${kind} ${no}: `, { size: 22 }), run(text, { size: 22 })],
    { align: AlignmentType.CENTER, line: 276, after: 200, before: kind === "Figure" ? 60 : 0, keepNext: kind === "Table" });
}
const tbl = (title, rows, widths, o) => [caption("Table", title), grid(rows, widths, o), P("", { after: 120 })];
function imgSize(buf) {
  if (buf[0] === 0x89) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("no size");
}
function fig(file, widthIn, text) {
  const buf = fs.readFileSync(file);
  const [w, h] = imgSize(buf);
  let wpx = Math.round(widthIn * 96), hpx = Math.round(wpx * h / w);
  const maxH = 8.2 * 96; if (hpx > maxH) { wpx = Math.round(wpx * maxH / hpx); hpx = maxH; }
  return [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 0 },
    children: [new ImageRun({ type: buf[0] === 0x89 ? "png" : "jpg", data: buf, transformation: { width: wpx, height: hpx },
      altText: { title: text, description: text, name: path.basename(file) } })] }), caption("Figure", text)];
}
const shot = (name, w, text) => fig(path.join(ROOT, "shots", name), w, text);
const asset = (name, w, text) => fig(path.join(ROOT, "assets", name), w, text);

// ------------------------------------------------------------------ front matter
const logoCover = fs.readFileSync(path.join(ROOT, "assets", "logo-000.jpg"));
const logoBona = fs.readFileSync(path.join(ROOT, "assets", "logo-001.jpg"));
const teamLine = (sz) => TEAM.map(([n, r]) => C([run(`${n} [${r}]`, { size: sz })], { after: 40 }));
const cover = [
  C([run(TITLE1, { font: "Cambria", size: 36 })], { before: 240, after: 0, line: 300 }),
  C([run(TITLE2, { font: "Cambria", size: 36 })], { after: 200, line: 300 }),
  C([run("21CSC302J – Computer Networks Course Case Study Project", { size: 24 })], { after: 160 }),
  C([run("Submitted by", { size: 24 })], { after: 120 }),
  ...teamLine(24),
  C([run("Under the guidance of", { size: 28 })], { before: 160, after: 60 }),
  C([run(FACULTY.name, { size: 24 })], { after: 60 }),
  C([run(FACULTY.designation, { size: 26 })], { after: 40 }),
  C([run("Department of Computing Technologies", { size: 28 })], { after: 60 }),
  C([run("in partial fulfillment of the requirements for the degree", { size: 24 })], { after: 40 }),
  C([run("of", { size: 24 })], { after: 40 }),
  C([run("Bachelor of Technology", { size: 24 })], { after: 40 }),
  C([run("in", { size: 24 })], { after: 40 }),
  C([run("Department of Computing Technologies", { size: 28 })], { after: 360 }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new ImageRun({ type: "jpg", data: logoCover,
    transformation: { width: 160, height: 92 }, altText: { title: "SRM logo", description: "SRM Institute of Science and Technology", name: "srm" } })] }),
  C([run("FACULTY OF ENGINEERING AND TECHNOLOGY", { size: 28 })], { after: 40 }),
  C([run("SCHOOL OF COMPUTING", { size: 28 })], { after: 40 }),
  C([run("SRM INSTITUTE OF SCIENCE AND TECHNOLOGY", { size: 28 })], { after: 40 }),
  C([run("KATTANKULATHUR - 603203", { size: 28 })], { after: 40 }),
  C([run("November 2026", { size: 28 })], { after: 0 }),
];
const teamText = TEAM.map(([n, r]) => `${n} [${r}]`);
const teamJoined = teamText.slice(0, -1).join(", ") + " and " + teamText[teamText.length - 1];
const bonafide = [
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.LEFT, spacing: { after: 360 }, children: [new ImageRun({ type: "jpg", data: logoBona,
    transformation: { width: 190, height: 68 }, altText: { title: "SRM logo", description: "SRM Institute of Science and Technology", name: "srm2" } })] }),
  C([run("SRM INSTITUTE OF SCIENCE AND TECHNOLOGY", { size: 24 })], { after: 40 }),
  C([run("KATTANKULATHUR-603203", { size: 24 })], { after: 480 }),
  C([run("BONAFIDE CERTIFICATE", { size: 24 })], { after: 480 }),
  P([run("This is to certify that 21CSC302J – Case study report titled “"), run(TITLE_UP), run(`” is the bonafide work of ${teamJoined}, who undertook the task of completing the report within the allotted time.`)],
    { size: 28, line: 400, after: 1200 }),
  ...[["SIGNATURE"], ["Faculty In-Charge"], [""], [FACULTY.name], [FACULTY.designation], ["Department of Computing Technologies"],
    ["SRM Institute of Science and Technology"], ["Kattankulathur Campus, Chennai"]].map(([t]) => P(t, { align: AlignmentType.LEFT, indent: { left: 200 }, line: 260, after: 0 })),
];
const declaration = [
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [B("DECLARATION", { size: 28 })] }),
  P(`We hereby declare that the case study report entitled “${TITLE_UP}” submitted for the course 21CSC302J – Computer Networks at the School of Computing, SRM Institute of Science and Technology, Kattankulathur, is a record of original work carried out by us under the guidance of ${FACULTY.name}, ${FACULTY.designation}, Department of Computing Technologies.`),
  P("The software, the Cisco Packet Tracer network, the measurements and the screenshots presented in this report were produced by us. This work has not been submitted, in part or in full, to any other institution or for the award of any other degree or diploma."),
  P("", { after: 600 }),
  P("Place: Kattankulathur", { align: AlignmentType.LEFT, after: 0 }),
  P("Date: 17 November 2026", { align: AlignmentType.RIGHT, after: 240 }),
  ...teamText.map((t) => P(t, { align: AlignmentType.RIGHT, after: 120 })),
];
const ack = [
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [B("ACKNOWLEDGEMENT", { size: 28 })] }),
  P(`We express our sincere gratitude to our faculty guide, ${FACULTY.name}, ${FACULTY.designation}, Department of Computing Technologies, for the guidance, encouragement and constructive feedback that shaped this case study from the first idea to the final demonstration.`),
  P("We thank the Head of the Department of Computing Technologies, the Dean of the School of Computing and the management of SRM Institute of Science and Technology for the laboratory facilities and the academic environment needed to complete the 21CSC302J Computer Networks course."),
  P("We are grateful to the Cisco Networking Academy for making Packet Tracer freely available to students, to the authors of the Model Context Protocol specification and its open-source Python SDK, and to the maintainers of psutil and dnspython, on which our tools are built. Finally, we thank our families and friends for their constant support throughout the semester."),
  P("", { after: 400 }),
  ...teamText.map((t) => P(t, { align: AlignmentType.RIGHT, after: 120 })),
];
const abstract = [
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [B("ABSTRACT", { size: 28 })] }),
  P("When an Internet connection fails, a user sees only the symptom (“YouTube will not load”) while the cause can sit at any layer of the network: a dead link, a missing IP address, a wrong default gateway, a broken route inside the provider, or a DNS server that has stopped answering. Finding the layer requires the same ordered sequence of tests that a network engineer runs by hand. This case study automates that sequence and makes it available to AI assistants through the Model Context Protocol (MCP), an open standard by which a language model calls external tools."),
  P("We built a Python package, netdiag, that exposes eleven read-only network tools as an MCP server: interfaces, Wi-Fi signal, IP configuration, ping, traceroute, routing table, ARP table, DNS lookup, TCP port check, HTTP check and a complete diagnosis. The diagnosis engine tests the network from the physical layer upwards and stops at the first failing layer, so its answer names the layer, the evidence, the meaning in plain words and a fix. A command-line interface runs it without any AI service, and an agent lets Claude choose the tools from a question asked in ordinary language. The tools run on Windows, macOS and Linux, validate every host name and never invoke a shell."),
  P("To verify the method against known faults, we built a reference network in Cisco Packet Tracer 9.0.1: a home LAN served by DHCP, two Cisco 2911 routers joined by a /30 link running OSPF area 0, and an ISP segment with a DNS server and a web server named youtube.com. We captured real screenshots of the healthy network and of three injected faults (a shut switch port, a removed OSPF network and a stopped DNS service); in each case the first failing check matched the injected layer. On the college Wi-Fi network the first version of the tool wrongly blamed the gateway because the campus routers drop ICMP; we added a TCP fallback that distinguishes “filtered ping” from “really down”, after which all nine checks pass with two warnings. The project has 25 automated tests, all passing. The report documents requirements, architecture, configuration, results, a live demonstration procedure and future work."),
  P([B("Keywords: "), run("network troubleshooting, OSI model, Model Context Protocol, AI agent, ping, traceroute, DNS, OSPF, DHCP, Cisco Packet Tracer.")]),
];
const ABBR = [
  ["API", "Application Programming Interface"], ["ARP", "Address Resolution Protocol"], ["CLI", "Command Line Interface"],
  ["DHCP", "Dynamic Host Configuration Protocol"], ["DNS", "Domain Name System"], ["DR / BDR", "Designated Router / Backup Designated Router"],
  ["HTTP(S)", "Hypertext Transfer Protocol (Secure)"], ["ICMP", "Internet Control Message Protocol"], ["IOS", "Internetwork Operating System"],
  ["IP", "Internet Protocol"], ["ISP", "Internet Service Provider"], ["JSON", "JavaScript Object Notation"], ["JSON-RPC", "JSON Remote Procedure Call"],
  ["LAN", "Local Area Network"], ["LLM", "Large Language Model"], ["MAC", "Media Access Control"], ["MCP", "Model Context Protocol"],
  ["NMS", "Network Management System"], ["OSI", "Open Systems Interconnection"], ["OSPF", "Open Shortest Path First"], ["PC", "Personal Computer"],
  ["PT", "Packet Tracer"], ["RFC", "Request for Comments"], ["RSSI", "Received Signal Strength Indicator"], ["RTT", "Round-Trip Time"],
  ["SNMP", "Simple Network Management Protocol"], ["SYN / ACK", "Synchronise / Acknowledge (TCP flags)"], ["TCP", "Transmission Control Protocol"],
  ["TTL", "Time To Live"], ["UDP", "User Datagram Protocol"], ["WAN", "Wide Area Network"],
];

// ------------------------------------------------------------------ body
const body = [];
const push = (...xs) => xs.flat().forEach((x) => body.push(x));

// ---------------- Chapter 1
push(chapter(1, "Introduction"));
push(H2("Background"));
push(P("A computer network is a collection of autonomous devices that exchange data according to agreed rules called protocols. Networks are organised in layers. The physical layer moves bits over copper, fibre or radio; the data link layer delivers frames inside one local network using MAC addresses; the network layer carries IP packets across many networks, chosen hop by hop by routers; the transport layer gives applications reliable byte streams over TCP or lightweight datagrams over UDP; and the application layer provides services such as DNS name resolution and the web [1], [2]. Each layer relies on every layer beneath it."),
  P("That dependency gives troubleshooting its classic shape. If a web page will not load, the fault may be a cable or a Wi-Fi signal, a missing address from DHCP, a wrong default gateway, a broken route in the provider’s network, a DNS server that does not answer, a closed port, or a failing web server. An engineer finds it by testing from the bottom up: is the interface up, is there an address, does the gateway answer, does a public address answer, does the name resolve, does the port accept a connection, does the server reply? The first test that fails points to the broken layer [3]."),
  P("Language-model assistants are now widely used to answer technical questions, but on their own they cannot see the user’s network: they can only guess. The Model Context Protocol (MCP), published as an open specification in 2024, lets an assistant call tools that run on the user’s computer and read their results [4]. With the right tools, an assistant can run the same tests an engineer would and base its answer on evidence instead of guesswork."));
push(H2("Industry/Domain Context"));
push(P("Network problems are among the most common reasons people call technical support. Internet providers, campus IT desks and corporate help desks spend much of their time walking users through the same steps: restart the router, check the Wi-Fi, run ipconfig, try ping 8.8.8.8, change the DNS server. Enterprise teams use network management systems with SNMP polling and flow analysis, but those watch the infrastructure, not the experience of one person on one laptop, and they are not available to home users or students [5]."),
  P("At the same time, AI agents that act through tools are entering operations work. Vendors are adding assistants to their consoles, and MCP is being adopted by desktop assistants and development tools as the common way to connect a model to external capabilities [4], [6]. A network diagnosis server that speaks MCP can therefore be used by any compatible assistant, on any operating system, without being tied to one vendor."),
  P("Campus networks add a practical twist that this project met directly. Many institutional networks filter ICMP (the protocol used by ping and traceroute) and block outside DNS resolvers for security reasons, while ordinary web traffic over TCP flows normally. A tool that relies only on ping will report a broken network when nothing is wrong. Handling such networks correctly is part of building a diagnosis tool people can trust."));
push(H2("Problem Statement"));
push(P("Design and implement a network diagnosis agent that, given the site a user cannot reach, tests the user’s network layer by layer with real measurements, identifies the first failing layer, explains the evidence in plain words and proposes a fix; expose its tests to AI assistants through the Model Context Protocol; and verify the method against known, deliberately injected faults in a Cisco Packet Tracer network."),
  P("The solution must work on Windows, macOS and Linux, must never change a setting on the user’s computer, must refuse unsafe input, and must distinguish a network that filters ping from a network that is actually down."));
push(H2("Objectives"));
["Build an MCP server that offers read-only tools for every layer: interfaces and Wi-Fi signal (physical and data link), addressing, gateway, ping, traceroute, routes and ARP (network), TCP port check (transport), and DNS and HTTP checks (application).",
  "Implement a bottom-up diagnosis that stops at the first failing layer and reports the layer, the evidence, the diagnosis and the fix, together with warnings for packet loss, latency, jitter and a weak signal.",
  "Provide a command-line interface that runs without any AI service, and an agent through which Claude chooses the tools from a question in natural language.",
  "Build a reference network in Cisco Packet Tracer with DHCP, OSPF and DNS, and inject one fault per layer to check that the diagnosis method finds each one.",
  "Validate the software with automated tests covering every failure scene, output parsing on all three operating systems and rejection of unsafe host names.",
  "Run the tool on a real network (the college Wi-Fi), record the results and correct any wrong diagnosis.",
].forEach((t) => push(numbered(t, "obj")));
push(H2("Scope and Limitations"));
push(P("The project covers diagnosis, not repair: the tools only read state and never change addresses, routes or DNS settings. The diagnosis follows a single path towards one target site; it does not map an entire network or monitor it continuously. IPv4 is the primary focus; IPv6 addresses are reported but not diagnosed separately."),
  P("Packet Tracer simulates a subset of Cisco IOS and of end-host behaviour. Its PCs offer ipconfig, ping, tracert and nslookup but cannot run Python, so in the simulated network the same checks were run by hand in the same order the agent uses, while the software itself was run on a real computer. The agent mode needs an Anthropic API key; every other part works offline from any AI service. Wireless signal strength is available only where the operating system reports it."));
push(H2("Organization of the Report"));
push(P("Chapter 2 surveys existing approaches to network troubleshooting and AI tool use and compares them with this project. Chapter 3 describes the methodology: requirements, the architecture of the MCP server and diagnosis engine, and the Packet Tracer reference network. Chapter 4 explains the implementation, the core configurations and code, the challenges met and the live demonstration procedure. Chapter 5 presents the results: real Packet Tracer screenshots of the healthy and faulty networks, real output on the college network before and after the ICMP fix, the MCP client session and the test results. Chapter 6 concludes and lists future work. Appendix A gives the complete router configurations and key source listings, and Appendix B the verification command guide."));

// ---------------- Chapter 2
push(chapter(2, "Literature Survey"));
push(H2("Introduction"));
push(P("This chapter reviews the foundations the project builds on: layered troubleshooting practice, the classic diagnostic tools and protocols, network management systems, automated and expert-system diagnosis, and the recent work on language models that act through tools, which led to the Model Context Protocol."));
push(H2("Review of Existing Approaches"));
push(H3("2.2.1 Layered troubleshooting methodology"));
push(P("Textbooks and vendor curricula teach troubleshooting through the layered model: bottom-up, top-down, or divide-and-conquer starting at the network layer [1], [3]. Bottom-up is slow for an expert who already suspects the cause, but it is complete and deterministic, which makes it ideal for automation: each test is cheap, and the first failure is unambiguous because every higher layer depends on it. Kurose and Ross stress that a failure at one layer is usually seen as a symptom at the layers above it, which is why users report “the website is down” when the cause is a DNS or routing fault [1]."));
push(H3("2.2.2 Diagnostic tools and the protocols behind them"));
push(P("Ping sends ICMP echo requests and measures the round-trip time and packet loss [7]. Traceroute sends probes with increasing TTL values and lists the routers that return ICMP time-exceeded messages, which shows where along a path replies stop. ARP maps IP addresses to MAC addresses on a LAN [8]. DHCP hands hosts their address, gateway and DNS servers; an address in 169.254.0.0/16 shows that DHCP failed and the host configured itself [9]. DNS resolves names to addresses through recursive resolvers [10]. A TCP connection begins with the three-way handshake (SYN, SYN-ACK, ACK), so completing it proves that a port is open and that the path carries TCP traffic [11]. OSPF is a link-state routing protocol in which routers form adjacencies, flood link-state advertisements and compute shortest paths; a missing network statement removes a route from every router in the area [12]. These standard tools are reliable but report raw facts; interpreting them still requires an expert."));
push(H3("2.2.3 Network management systems"));
push(P("Enterprise operations rely on SNMP polling, NetFlow/IPFIX traffic records and syslog collected by network management systems such as Nagios, Zabbix or commercial platforms [5]. They give a continuous view of the infrastructure and alert on device or link failures, but they need agents or credentials on the devices, they are configured by specialists, and they do not see an individual user’s laptop, Wi-Fi signal or DNS settings. They answer “is the network up?” rather than “why can’t this person open this site?”."));
push(H3("2.2.4 Operating-system troubleshooters"));
push(P("Windows Network Diagnostics, macOS Wireless Diagnostics and similar tools run a fixed set of checks and suggest fixes such as resetting an adapter. They are convenient but closed: their checks cannot be called by other programs, their reasoning is not shown, and each exists on one operating system only. They also assume a home network and often misreport filtered campus or enterprise networks."));
push(H3("2.2.5 Expert systems and automated fault diagnosis"));
push(P("Research on automated network fault diagnosis has used rule-based expert systems, Bayesian networks over symptoms and causes, and, more recently, machine-learning classifiers trained on telemetry [13]. Rule-based systems encode exactly the kind of bottom-up reasoning used here; their weakness is the effort of writing and maintaining rules and the rigid interaction with the user. Learning-based systems need labelled failure data, which is scarce outside large operators."));
push(H3("2.2.6 Language models that use tools"));
push(P("ReAct showed that language models solve tasks more reliably when they interleave reasoning with actions that fetch external information [14], and Toolformer showed that models can learn when to call an API [15]. Commercial models now support structured tool calling, in which the application describes each tool with a JSON schema and the model returns a call for the application to execute [6]. The Model Context Protocol standardises this exchange: a server describes its tools, a client inside the assistant lists and calls them over JSON-RPC, and the same server works with every compatible assistant [4]. MCP servers exist for files, databases and web services; a server dedicated to layered network diagnosis with safe, cross-platform tools was the gap this project addresses."));
push(H2("Comparative Analysis"));
push(P("Table 2.1 compares the approaches reviewed above with the proposed system on the properties that matter for a single user diagnosing their own connection."));
push(tbl("Comparison of existing troubleshooting approaches with the proposed system", [
  ["Approach", "Sees the user’s own connection", "Names the failing layer", "Explains in plain words", "Usable by an AI assistant", "Cross-platform", "Handles filtered ICMP"],
  ["Manual commands (ping, tracert, nslookup)", "Yes", "Only with expertise", "No", "No", "Yes", "Only with expertise"],
  ["Network management systems (SNMP, NetFlow)", "No", "Device level", "Partly", "No", "Server-side", "Not applicable"],
  ["OS troubleshooters", "Yes", "Partly", "Yes", "No", "No", "Often wrong"],
  ["Rule-based expert systems", "Depends", "Yes", "Yes", "No", "Depends", "Only if encoded"],
  ["General chat assistant without tools", "No", "Guesses", "Yes", "Not applicable", "Yes", "No"],
  ["Proposed: netdiag MCP server and agent", "Yes", "Yes, first failing layer", "Yes", "Yes, via MCP", "Windows, macOS, Linux", "Yes (TCP fallback)"],
], [2050, 1100, 1150, 1050, 1150, 1250, 1276], { center: [1, 2, 3, 4, 5, 6], size: 19 }));
push(P("The proposed system combines the strengths of manual commands (real evidence from the user’s own machine) with those of rule-based systems (deterministic layered reasoning and a plain-language answer), and makes both available to any MCP-compatible assistant. The TCP fallback, added after testing on the college network, addresses the main weakness shared by ping-based tools."));

// ---------------- Chapter 3
push(chapter(3, "Methodology"));
push(H2("Approach Overview"));
push(P("The work followed four stages. First, the troubleshooting procedure was written down as an ordered list of checks, one or two per layer, each with the meaning of its failure. Second, each check was implemented as a safe, cross-platform Python function and exposed as an MCP tool. Third, the diagnosis engine was written to run the checks in order and stop at the first failure, and the CLI and agent were added on top. Fourth, the method was verified twice: against a Packet Tracer network with deliberately injected faults, and against a real network, the college Wi-Fi."),
  P("Figure 3.1 shows how the parts fit together. A person asks a question; the agent (or any MCP client such as Claude Desktop or Claude Code) starts the netdiag MCP server, lists its tools and calls them; the tools run the operating system’s own commands or open sockets and return structured JSON; and the answer is built from that evidence."));
push(asset("architecture.png", 6.3, "Architecture: the person, the diagnosis agent, the netdiag MCP server and its tools, and the network under test"));
push(P("Figure 3.2 shows the diagnosis method itself. It begins at the physical layer and climbs; each layer is tested only when every layer below it has passed."));
push(asset("diagnosis-flow.png", 6.3, "The bottom-up diagnosis: six checks from the physical layer to the application, with the meaning of each failure"));
push(H2("Data Collection / Requirements Gathering"));
push(P("Requirements were gathered from the course syllabus, from the questions people actually ask when their connection fails, and from the commands taught in the laboratory. Table 3.1 lists the functional requirements and Table 3.2 the non-functional ones."));
push(tbl("Functional requirements", [
  ["ID", "Requirement"],
  ["F1", "List every network interface with its state, addresses, MAC address, speed and error counters."],
  ["F2", "Report Wi-Fi signal strength in dBm with a strong / ok / weak rating where the system provides it."],
  ["F3", "Report the IPv4 address, default gateway and DNS servers, and detect a 169.254 (failed DHCP) address."],
  ["F4", "Ping a host and report replies, loss, average latency and jitter."],
  ["F5", "Traceroute to a host and report every hop and the last hop that replied."],
  ["F6", "Show the routing table and the ARP table."],
  ["F7", "Resolve a name through the system DNS or a chosen server such as 1.1.1.1."],
  ["F8", "Test a TCP handshake to host:port and fetch an HTTP status code with timing."],
  ["F9", "Run the full bottom-up diagnosis and return layer, evidence, diagnosis, fix and warnings."],
  ["F10", "Expose all of the above as MCP tools, and as CLI commands with optional JSON output."],
  ["F11", "Answer questions in natural language through an agent that chooses the tools itself."],
], [800, 8226], { center: [0] }));
push(tbl("Non-functional requirements", [
  ["ID", "Requirement", "How it is met"],
  ["N1", "Safety: never change a setting", "Every tool only reads; no tool writes configuration"],
  ["N2", "Safety: refuse unsafe input", "Host names validated against an IP / host-name pattern; commands run as argument lists, never through a shell"],
  ["N3", "Portability", "Separate parsers for Windows, macOS and Linux output; tested with captured samples of each"],
  ["N4", "Speed", "Short timeouts (2–5 s per probe); a full healthy diagnosis completes in a few seconds"],
  ["N5", "Works without AI", "CLI and diagnosis run locally with no API key"],
  ["N6", "Correct on filtered networks", "TCP fallback when ping is blocked (added in this project)"],
  ["N7", "Testability", "Tools injected into the diagnosis so tests can simulate any fault; 25 automated tests"],
], [700, 2600, 5726], { center: [0] }));
push(P("Table 3.3 maps each tool to the layer it tests and to the syllabus topic it exercises."));
push(tbl("MCP tools, the layer each tests and the syllabus topic", [
  ["Tool", "Layer", "What it tells you", "Syllabus topic"],
  ["interfaces", "Physical, data link", "Up or down, addresses, MAC, speed, frame errors", "Unit 1: physical layer, NICs"],
  ["wifi_signal", "Physical", "Signal in dBm: strong, ok or weak", "Unit 1: transmission media, wireless"],
  ["ip_config", "Network", "IPv4 address, default gateway, DNS servers", "Unit 2/3: IP addressing, DHCP"],
  ["ping", "Network", "Replies, packet loss, latency, jitter", "Unit 3: ICMP"],
  ["traceroute", "Network", "Every router on the path, and where replies stop", "Unit 3: routing, TTL"],
  ["route_table", "Network", "The routing table, including the default route", "Unit 3: routing tables"],
  ["arp_table", "Data link", "IP-to-MAC pairs on the local network", "Unit 2: ARP"],
  ["port_check", "Transport", "A TCP three-way handshake to a port", "Unit 4: TCP"],
  ["dns_lookup", "Application", "Name to IP, system DNS or a chosen server", "Unit 5: DNS"],
  ["http_check", "Application", "HTTP status code and response time", "Unit 5: HTTP"],
  ["diagnose", "All", "The whole bottom-up sequence in one call", "All units"],
], [1500, 1500, 3300, 2726], { mono: [0] }));
push(H2("Architecture"));
push(H3("3.3.1 Software architecture"));
push(P("The package is split into small modules with one job each. tools.py implements the eleven checks; parse.py turns the text printed by ping, traceroute, route and arp on each operating system into structured data; diagnose.py holds the bottom-up method and the report format; server.py registers the tools with the MCP Python SDK (FastMCP) and serves them over standard input and output; cli.py provides the netdiag command; and agent.py connects Claude to the server. Table 3.4 summarises the modules."));
push(tbl("Modules of the netdiag package", [
  ["Module", "Lines", "Responsibility"],
  ["netdiag/tools.py", "261", "The checks: interfaces, Wi-Fi, ARP, gateway, DNS servers, ping, traceroute, DNS lookup, TCP port, HTTP; host validation"],
  ["netdiag/parse.py", "127", "Parsers for ping, traceroute, default gateway, DNS servers, ARP and Wi-Fi output on Windows, macOS and Linux"],
  ["netdiag/diagnose.py", "200", "Bottom-up diagnosis with early stop, ICMP-filter fallback, warnings and the text report"],
  ["netdiag/server.py", "126", "MCP server: eleven tools with descriptions and argument schemas, served over stdio"],
  ["netdiag/cli.py", "54", "netdiag command-line interface with sub-commands and --json"],
  ["netdiag/agent.py", "109", "Claude agent: starts the server, offers its tools and runs the tool-use loop"],
  ["tests/", "–", "25 tests: every failure scene, parsing on all systems, unsafe input"],
], [2300, 900, 5826], { mono: [0], center: [1] }));
push(P("The MCP exchange works as follows. The client launches netdiag-server as a child process and sends an initialize request; the server answers with its name and capabilities. The client calls tools/list and receives each tool’s name, description and JSON schema of arguments. When the model decides to use a tool, the client sends tools/call with the arguments; the server runs the check and returns the result as text or JSON. Because the transport is standard input and output, nothing listens on a network port."));
push(H3("3.3.2 The reference network in Cisco Packet Tracer"));
push(P("To test the method against faults whose cause is known in advance, we built a small network that contains every layer the diagnosis checks: a LAN with DHCP, a router-to-router link with dynamic routing, a DNS server and a web server. Figure 3.3 shows the addressing plan and Figure 3.4 the topology as built in Packet Tracer 9.0.1."));
push(asset("network-plan.png", 6.3, "Addressing plan of the reference network: home LAN, OSPF link between the routers, and the ISP segment"));
push(shot("01_topology_all_links_up.jpg", 6.3, "Packet Tracer topology of Network-Diagnosis-Demo.pkt with every link up (real screenshot)"));
push(tbl("Device inventory of Network-Diagnosis-Demo.pkt", [
  ["Device", "Packet Tracer model", "Role"],
  ["PC0, PC1", "PC-PT", "Clients on the home LAN, addresses from DHCP"],
  ["Switch0", "2960-24TT", "Access switch for the home LAN"],
  ["HomeRouter", "2911", "Default gateway, DHCP server (pool HOME), OSPF"],
  ["ISPRouter", "2911", "Provider router, OSPF, gateway of the server segment"],
  ["Switch1", "2960-24TT", "Switch for the ISP server segment"],
  ["DNS-Server", "Server-PT", "DNS with an A record youtube.com → 203.0.113.80"],
  ["youtube.com", "Server-PT", "Web server (HTTP)"],
], [2000, 2200, 4826]));
push(tbl("Addressing table", [
  ["Device", "Interface", "IP address / mask", "Gateway", "Notes"],
  ["HomeRouter", "G0/0", "192.168.1.1 /24", "–", "LAN gateway, DHCP server"],
  ["HomeRouter", "G0/1", "10.0.0.1 /30", "–", "Link to ISPRouter, OSPF area 0"],
  ["ISPRouter", "G0/0", "10.0.0.2 /30", "–", "Link to HomeRouter, OSPF area 0"],
  ["ISPRouter", "G0/1", "203.0.113.1 /24", "–", "Server segment, OSPF area 0"],
  ["DNS-Server", "Fa0", "203.0.113.53 /24", "203.0.113.1", "DNS service on"],
  ["youtube.com", "Fa0", "203.0.113.80 /24", "203.0.113.1", "HTTP service on"],
  ["PC0, PC1", "Fa0", "DHCP: 192.168.1.21 onward", "192.168.1.1", "DNS 203.0.113.53 from DHCP"],
], [1700, 1100, 2400, 1500, 2326], { center: [1, 3] }));
push(tbl("Physical links", [
  ["From", "To", "Cable"],
  ["PC0 Fa0", "Switch0 Fa0/1", "Copper straight-through"],
  ["PC1 Fa0", "Switch0 Fa0/2", "Copper straight-through"],
  ["Switch0 G0/1", "HomeRouter G0/0", "Copper straight-through"],
  ["HomeRouter G0/1", "ISPRouter G0/0", "Copper cross-over"],
  ["ISPRouter G0/1", "Switch1 G0/1", "Copper straight-through"],
  ["DNS-Server Fa0, youtube.com Fa0", "Switch1 Fa0/1, Fa0/2", "Copper straight-through"],
], [3200, 3000, 2826]));
push(P("The address 203.0.113.0/24 is the TEST-NET-3 block reserved for documentation, so the simulated “Internet” can never clash with real addresses. The /30 link uses exactly two host addresses, the smallest subnet for a point-to-point link. OSPF process 1 advertises all three networks in area 0, so each router learns the network on the far side of the other."));
push(H2("Implementation Strategy"));
push(P("Each fault scene was designed to break exactly one layer while leaving the others intact, so that the expected first failing check is known in advance. Table 3.8 lists the scenes, the fault injected and the expected result. Scenes 1, 3 and 4 were executed in Packet Tracer and captured as screenshots; every scene, including scene 2, is also reproduced in the automated tests with simulated tool results."));
push(tbl("Fault scenes and the expected first failing check", [
  ["Scene", "Layer", "Fault injected", "Expected first failure", "Expected diagnosis"],
  ["0", "–", "None", "None", "Everything works"],
  ["1", "Physical", "Switch0 Fa0/1 shut down", "Ping to gateway", "Link is down: cable, port or Wi-Fi"],
  ["2", "Network (addressing)", "PC1 static gateway 192.168.1.100", "Ping beyond the LAN", "Wrong default gateway"],
  ["3", "Network (routing)", "OSPF network 203.0.113.0 removed", "Ping / tracert to the server", "Route missing after the home router"],
  ["4", "Application", "DNS service turned off", "nslookup", "Internet works, DNS server not answering"],
], [800, 1500, 2400, 1900, 2426], { center: [0] }));
push(P("The software followed the same strategy: the diagnosis receives its tools as a parameter, so each test replaces one tool with a broken version (for example a ping that never replies to the gateway) and checks that the report names the right layer. This makes the scenes repeatable without any network at all."));

// ---------------- Chapter 4
push(chapter(4, "Implementation"));
push(H2("Execution and Step-by-Step Analysis"));
push(H3("4.1.1 Building and configuring the Packet Tracer network"));
["Placed the eight devices and cabled them as in Table 3.7, using a cross-over cable between the two routers.",
  "Configured HomeRouter: interface addresses, a DHCP pool HOME (network 192.168.1.0/24, default router .1, DNS server 203.0.113.53) with .1 to .20 excluded, and OSPF process 1 for 192.168.1.0/24 and 10.0.0.0/30 in area 0.",
  "Configured ISPRouter: interface addresses and OSPF process 1 for 10.0.0.0/30 and 203.0.113.0/24 in area 0; checked that the OSPF adjacency reached FULL.",
  "Configured the servers statically, turned on the DNS service with an A record youtube.com → 203.0.113.80, and left HTTP on for the web server.",
  "Set PC0 and PC1 to DHCP and confirmed they received 192.168.1.21 and 192.168.1.22 with the right gateway and DNS server.",
  "Ran the scene 0 checks from PC0 (ipconfig, ping, tracert, nslookup, web browser) and saved the file as Network-Diagnosis-Demo.pkt.",
].forEach((t) => push(numbered(t, "build")));
push(P("Figure 4.1 shows PC0’s IP configuration obtained from DHCP, the first evidence that the physical, data link and addressing layers are working."));
push(shot("02_pc0_ip_configuration_dhcp.jpg", 4.2, "PC0 IP Configuration: address 192.168.1.22, gateway 192.168.1.1 and DNS 203.0.113.53 received by DHCP"));
push(H3("4.1.2 Implementing the tools"));
push(P("Each tool calls the operating system’s own utility with a fixed argument list (for example ping -c 3 on macOS and Linux, ping -n 3 on Windows) through subprocess without a shell, and parses its output. Interface data and counters come from psutil; DNS lookups use dnspython so that a specific server such as 1.1.1.1 can be queried; the TCP check opens a socket with a timeout; and the HTTP check sends a HEAD request and records the status and time. Before any command runs, check_host accepts only an IP address or a valid host name, so input such as “8.8.8.8; rm -rf /” is refused."),
  P("Parsing is the part that differs most between systems. Ping prints “time=12.3 ms” on macOS and Linux and “time=12ms” or “Average = 12ms” on Windows; traceroute and tracert format hops differently; the default gateway comes from route -n get default, ip route or route print. parse.py has one function per output with patterns for each system, and the tests feed it real captured samples of each."));
push(H3("4.1.3 Implementing the diagnosis"));
push(P("The diagnosis runs seven groups of checks in order: an active interface (and the Wi-Fi signal and frame-error counters); a usable IPv4 address and a default gateway; reaching the gateway; reaching the Internet by IP (1.1.1.1 or 8.8.8.8); resolving the target name; opening the TCP port; and fetching the web page. Each check is recorded as a step with its layer, whether it passed and its evidence. The first failure ends the run with a diagnosis and a fix. Two failures trigger extra work for precision: when the Internet is unreachable, a traceroute to 8.8.8.8 finds the last hop that replied, separating the home router’s uplink from a fault inside the ISP; and when DNS fails, the lookup is repeated through 1.1.1.1 to tell a dead DNS server from a name that does not exist."),
  P("Testing on the college network exposed a flaw: the campus gateway and public resolvers do not answer ping, so the first version reported “the router does not answer” on a working connection. The fix tries a TCP connection to the target when ping fails. If the handshake succeeds, packets clearly pass through the router, so the step passes with the evidence “ignores ping, but a TCP connection through it worked” and a warning that ICMP is filtered. The probe is made at most once per run and its result reused."));
push(H3("4.1.4 Exposing the tools through MCP and building the agent"));
push(P("server.py creates a FastMCP server named network-diagnosis with instructions that tell the model to work from the bottom layer up, and registers each function with @mcp.tool(). The function’s docstring becomes the tool description and its type hints become the argument schema, so the model knows, for example, that ping takes a host and an optional count. agent.py starts the server as a child process, gives Claude the tool list and runs the tool-use loop, printing each call as it happens, until Claude gives its final answer."));
push(H2("Core Configurations"));
push(H3("4.2.1 HomeRouter"));
push(...code(readProj("packet-tracer/HomeRouter-config.txt")));
push(H3("4.2.2 ISPRouter"));
push(...code(readProj("packet-tracer/ISPRouter-config.txt")));
push(P("Figures 4.2 and 4.3 show the configured routers in Packet Tracer: interface states, the OSPF adjacency and the routes learned through OSPF (marked O)."));
push(shot("06_homerouter_interfaces_ospf_routes.jpg", 5.0, "HomeRouter: interfaces up, OSPF neighbour 10.0.0.2 FULL/DR, route O 203.0.113.0/24 via 10.0.0.2"));
push(shot("08_isprouter_interfaces_ospf_routes.jpg", 5.0, "ISPRouter: OSPF neighbour FULL/BDR and route O 192.168.1.0/24 learned from HomeRouter"));
push(shot("07_homerouter_dhcp_binding_pool_protocols.jpg", 5.0, "HomeRouter DHCP bindings for the two PCs (.21 and .22), pool HOME statistics and the OSPF routing protocol summary"));
push(shot("09_dns_server_a_record_youtube.jpg", 4.6, "DNS-Server: DNS service on with the A record youtube.com → 203.0.113.80"));
push(H3("4.2.3 The diagnosis step that handles filtered ping"));
push(...code(readProj("netdiag/diagnose.py", 97, 136)));
push(H3("4.2.4 Registering a tool with the MCP server"));
push(...code(readProj("netdiag/server.py", 26, 66)));
push(H2("Challenges Faced and Mitigation"));
push(tbl("Challenges and mitigation", [
  ["Challenge", "Effect", "Mitigation"],
  ["Campus network drops ICMP (gateway and 8.8.8.8 never answer ping) and blocks outside DNS", "First version reported a gateway failure on a working network", "TCP fallback: if a handshake to the target succeeds, mark the step passed with an ICMP-filtered warning; tested on the college Wi-Fi"],
  ["Different command output on Windows, macOS and Linux", "One parser could not read all systems", "Separate patterns per system in parse.py, tested with real captured samples"],
  ["Command injection through host names", "A malicious request could run commands", "check_host validation; argument lists without a shell; test with unsafe inputs"],
  ["OSPF takes up to about 40 seconds to return to FULL after a fix", "Scene 3 recovery looks broken if checked too early", "Wait for adjacency; explain hop-by-hop forwarding meanwhile during the demo"],
  ["First ping after opening the .pkt file may time out once", "False failure at the start of the demo", "Warm up with scene 0 before the class; Packet Tracer learns MAC addresses by ARP"],
  ["Packet Tracer PCs cannot run Python", "The software cannot run inside the simulation", "Run the same checks by hand in the same order on PC0; run the software on a real computer"],
  ["Testing failures without breaking a real network", "Hard to reproduce faults", "Tools injected into the diagnosis; tests replace one tool per scene"],
  ["Agent needs an API key and costs money per call", "Not every user can run the agent", "The CLI and diagnosis need no key; the agent is optional"],
], [2900, 2600, 3526], { size: 19 }));
push(H2("Live Demonstration Procedure"));
push(P("The live demonstration takes about eight minutes and has two parts. Part A runs the software on the presenter’s laptop on the college Wi-Fi; Part B breaks the Packet Tracer network one layer at a time while PC0’s command prompt is shown on the projector. Each team member presents one scene."));
push(H3("Part A: the tool on the real network (about 2 minutes)"));
push(...code(`cd network-mcp && source .venv/bin/activate
netdiag diagnose youtube.com        # nine checks; gateway ignores ping, TCP fallback passes
netdiag dns youtube.com             # campus DNS answers
netdiag dns youtube.com --server 1.1.1.1   # outside DNS blocked on campus: timeout
netdiag port youtube.com 443        # TCP handshake succeeds
python ../cn-report/capture/mcp_client_demo.py   # MCP client lists 11 tools and calls two`));
push(H3("Part B: one fault per layer in Packet Tracer (about 6 minutes)"));
push(tbl("Live demonstration script", [
  ["Scene / presenter", "Break", "Checks on PC0", "What the class sees", "Fix"],
  ["0 Working\nV. Anbu Chelvan", "–", "ipconfig, ping 192.168.1.1, ping 203.0.113.80, tracert, nslookup", "All pass", "–"],
  ["1 Physical\nB. Charith Reddy", "Switch0: interface fa0/1, shutdown", "ping 192.168.1.1", "Link light red; gateway times out", "no shutdown"],
  ["2 Addressing\nY. Rupesh Reddy", "PC1 static, gateway 192.168.1.100", "ipconfig, ping .1, ping 203.0.113.80", "LAN works, nothing leaves it", "PC1 back to DHCP"],
  ["3 Routing\nBasith Nistar", "ISPRouter: router ospf 1, no network 203.0.113.0 0.0.0.255 area 0", "ping, tracert 203.0.113.80", "Tracert stops at 192.168.1.1; unreachable", "Restore the network statement; wait for FULL"],
  ["4 Application\nAdhithyan K", "DNS-Server: Services → DNS → Off", "ping 203.0.113.80, nslookup youtube.com", "Ping works, nslookup times out", "DNS → On"],
], [1700, 2100, 2000, 1800, 1426], { size: 19 }));
push(P("Before presenting: open the saved file, wait for every link light to turn green, run scene 0 once so the devices learn each other’s MAC addresses, and keep the four break steps on a note. The original file is never saved in a broken state."));

// ---------------- Chapter 5
push(chapter(5, "Results and Discussion"));
push(H2("Findings and Output"));
push(P("All results in this chapter are real: the Packet Tracer figures are screenshots of Network-Diagnosis-Demo.pkt running in Cisco Packet Tracer 9.0.1, and the terminal figures are the exact output of the commands run on a MacBook on the SRM college Wi-Fi on 17 November 2026. Table 5.1 summarises the verification tests."));
push(tbl("Verification tests and results", [
  ["Test", "Where", "Expected", "Observed", "Result"],
  ["T1 DHCP lease", "PT, PC0", "192.168.1.21+ with gw .1, DNS .53", "192.168.1.22, gw 192.168.1.1, DNS 203.0.113.53", "Pass"],
  ["T2 Gateway and server reachable", "PT, PC0", "Replies", "Replies from 192.168.1.1 and 203.0.113.80", "Pass"],
  ["T3 Path through both routers", "PT, PC0", "192.168.1.1 → 10.0.0.2 → 203.0.113.80", "Same three hops", "Pass"],
  ["T4 Name resolution and web", "PT, PC0", "youtube.com → 203.0.113.80; page opens", "As expected", "Pass"],
  ["T5 OSPF adjacency and routes", "PT, routers", "FULL; O routes both ways", "FULL/DR and FULL/BDR; O routes present", "Pass"],
  ["T6 Scene 1: port shut", "PT", "Gateway ping fails first", "100% loss to 192.168.1.1; link red", "Pass"],
  ["T7 Scene 3: OSPF network removed", "PT", "Path stops after home router", "Tracert stops at 192.168.1.1; host unreachable", "Pass"],
  ["T8 Scene 4: DNS off", "PT", "Ping works, nslookup fails", "Ping replies; nslookup timed out ×3", "Pass"],
  ["T9 Real network, before fix", "Mac, campus", "Should pass (Internet works)", "FAIL at gateway (ICMP filtered)", "Defect found"],
  ["T10 Real network, after fix", "Mac, campus", "All checks pass, ICMP warnings", "9 of 9 pass, 2 warnings", "Pass"],
  ["T11 MCP protocol", "Mac", "11 tools listed; calls return JSON", "11 tools; dns_lookup and http_check answered", "Pass"],
  ["T12 Automated tests", "Mac", "All pass", "25 passed in 0.05 s", "Pass"],
], [2300, 1200, 2200, 2400, 926], { size: 19, center: [4] }));
push(H3("5.1.1 The healthy reference network (scene 0)"));
push(P("Figure 5.1 shows the agent’s first checks run by hand on PC0: ipconfig, then a ping to the gateway and a ping across both routers to the web server. All replies arrive, so the physical, data link and network layers work end to end."));
push(shot("03_pc0_ipconfig_ping_gateway_and_server.jpg", 5.0, "PC0 command prompt: ipconfig, ping to the gateway 192.168.1.1 and ping to the server 203.0.113.80 all succeed"));
push(P("Figure 5.2 shows the path and the name lookup. tracert lists the three hops 192.168.1.1 (HomeRouter), 10.0.0.2 (ISPRouter) and 203.0.113.80 (the server), confirming that the OSPF routes are used, and nslookup returns 203.0.113.80 from the DNS server at 203.0.113.53."));
push(shot("04_pc0_tracert_nslookup.jpg", 5.0, "PC0: tracert to 203.0.113.80 through both routers, and nslookup youtube.com answered by 203.0.113.53"));
push(shot("05_pc0_web_browser_http_youtube.jpg", 4.6, "PC0 web browser opens http://youtube.com: the application layer works"));
push(H3("5.1.2 Scene 1: physical layer fault"));
push(P("Switch0’s port Fa0/1, to which PC0 is connected, was shut down. The switch reports the port as administratively down (Figure 5.4), the link to PC0 turns red in the topology (Figure 5.5), and the very first network check, a ping to the gateway, fails with 100% loss (Figure 5.6). Because even the router next door cannot be reached and the link is down, the diagnosis is the physical layer, and the higher layers need not be tested."));
push(shot("11_scene1_switch0_fa0-1_shutdown.jpg", 5.0, "Scene 1: Switch0 interface fa0/1 shut down; show ip interface brief lists Fa0/1 as administratively down"));
push(shot("12_scene1_topology_pc0_link_red.jpg", 6.3, "Scene 1: the link between PC0 and Switch0 shown red in the topology"));
push(shot("13_scene1_pc0_gateway_unreachable.jpg", 5.0, "Scene 1: ping 192.168.1.1 from PC0 times out with 100% loss: the first check fails"));
push(H3("5.1.3 Scene 3: routing fault"));
push(P("On ISPRouter the OSPF statement for 203.0.113.0/24 was removed (Figure 5.7). HomeRouter immediately lost its route to the server segment (Figure 5.8). From PC0 the gateway still answers, but the tracert to the server stops at 192.168.1.1 and the router replies “Destination host unreachable” (Figure 5.9). The diagnosis is therefore a routing fault beyond the home router, not a problem on the PC: exactly the distinction the agent’s traceroute step is designed to make."));
push(shot("14_scene3_isprouter_ospf_network_removed.jpg", 5.0, "Scene 3: on ISPRouter, no network 203.0.113.0 0.0.0.255 area 0 removes the server segment from OSPF"));
push(shot("15_scene3_homerouter_route_missing.jpg", 5.0, "Scene 3: HomeRouter’s routing table no longer contains the O 203.0.113.0/24 route"));
push(shot("16_scene3_pc0_tracert_stops_at_home_router.jpg", 5.0, "Scene 3: tracert from PC0 stops at 192.168.1.1, which reports the destination unreachable"));
push(H3("5.1.4 Scene 4: application layer fault (DNS)"));
push(P("The DNS service on DNS-Server was switched off (Figure 5.10). Ping to the web server by address still works, so every lower layer passes, but nslookup youtube.com times out three times (Figure 5.11). The diagnosis is that the Internet connection works and only the DNS server is not answering, which is the answer our diagnosis gives when the system DNS fails but a lookup through another server succeeds."));
push(shot("10a_scene4_dns_service_switched_off.jpg", 3.6, "Scene 4: DNS service turned off on DNS-Server"));
push(shot("10_scene4_dns_service_off_nslookup_fails.jpg", 5.0, "Scene 4: ping 203.0.113.80 still replies, but nslookup youtube.com times out: the application layer fails"));
push(P("Scene 2 (wrong default gateway) was not captured as a screenshot; it is verified by the automated test test_scene2_wrong_gateway, which simulates a gateway of 192.168.1.100 that never answers and checks that the report blames the gateway address."));
push(H3("5.1.5 The tool on the real college network"));
push(P("Figure 5.12 shows the first run of netdiag diagnose youtube.com on the college Wi-Fi. The interface, Wi-Fi signal, address and gateway checks passed, but the gateway 10.9.0.1 gave no replies, so the tool concluded that the problem lay between the laptop and the router. That conclusion was wrong: web pages were loading normally."));
push(asset("term_t1_before_fix.png", 6.3, "First run on the college Wi-Fi: the gateway ignores ping, so the first version wrongly reports a network-layer fault"));
push(P("Figure 5.13 shows why. Ping to the gateway loses every packet and a DNS query to the outside resolver 1.1.1.1 times out, while Figure 5.14 shows that DNS through the campus resolver, a TCP handshake to port 443 and an HTTPS request all succeed. The campus network filters ICMP and outside DNS but carries ordinary TCP traffic. Figure 5.15 shows the configuration and Figure 5.16 a traceroute in which no hop replies at all, the signature of ICMP and probe filtering rather than of a broken path."));
push(asset("term_t5_campus.png", 6.3, "On campus: ping to the gateway loses 100% of packets and DNS through 1.1.1.1 times out"));
push(asset("term_t2_checks.png", 3.6, "Single tools on campus: DNS through the campus resolver, TCP port 443 open in 32 ms, HTTPS 200, Wi-Fi −60 dBm"));
push(asset("term_t7_ipconfig.png", 3.6, "netdiag ipconfig on campus: address 10.9.187.164, gateway 10.9.0.1, campus DNS servers (MAC address hidden)"));
push(asset("term_t8_traceroute.png", 3.6, "netdiag traceroute youtube.com on campus: none of the 15 hops replies, because probes are filtered"));
push(P("After the TCP fallback was added, the same command on the same network gives the result in Figure 5.17, where all nine checks pass, the gateway and Internet steps state that ping is ignored but TCP works, and two warnings explain the filtering. The diagnosis now matches reality."));
push(asset("term_t6_after_fix.png", 6.3, "After the fix, on the same network: nine of nine checks pass, with warnings that ICMP is filtered"));
push(P("For comparison, Figures 5.18 and 5.19 show the tool on a home network, where every check passes, and with a simulated DNS failure, where the lookup through 1.1.1.1 succeeds and the diagnosis correctly blames the DNS server."));
push(asset("diagnose-healthy.png", 5.6, "netdiag diagnose on a home network: nine checks pass, with a weak Wi-Fi warning"));
push(asset("diagnose-dns-down.png", 5.6, "netdiag diagnose with the DNS server down (simulated): the fallback lookup through 1.1.1.1 identifies the DNS server as the fault"));
push(H3("5.1.6 The MCP server in use"));
push(P("Figure 5.20 shows a minimal MCP client written with the official Python SDK. It launches netdiag-server over standard input and output, completes the initialize handshake, lists the eleven tools with their descriptions, and calls dns_lookup and http_check, receiving JSON results. Any MCP-compatible assistant uses the server in the same way."));
push(asset("term_t4_mcp.png", 6.3, "An MCP client connects to netdiag-server, lists the 11 tools and calls dns_lookup and http_check"));
push(H3("5.1.7 Automated tests"));
push(P("Figure 5.21 shows the test suite: 25 tests, all passing. The diagnosis tests cover every scene (physical link down, DHCP failure, wrong gateway, routing break inside the ISP, DNS server down, a name that does not exist, a closed port), the warnings for weak Wi-Fi and packet loss, the new campus cases (gateway and Internet ignoring ping while TCP works, and a router in the ARP table with nothing getting through), and the rejection of unsafe host names. The parser tests feed real ping, traceroute, gateway, DNS, ARP and Wi-Fi output from Windows, macOS and Linux."));
push(asset("term_t3_pytest.png", 6.0, "pytest: all 25 tests pass"));
push(H2("Discussion"));
push(P("In every Packet Tracer scene, the first failing check in the bottom-up order matched the layer at which the fault was injected: the gateway ping for the shut port, the path beyond the home router for the removed OSPF network, and nslookup for the stopped DNS service. This confirms the central idea of the method: because each layer depends on those below it, the first failure is the answer, and tests above it add no information."),
  P("The college network supplied the most useful result of the project. A diagnosis that relies on ICMP is wrong on any network that filters it, and many campus and enterprise networks do. The fix does not weaken the method; it replaces one kind of evidence with a stronger one. A completed TCP handshake to a server on the Internet proves that packets cross the gateway and the provider in both directions, which is more than a ping can prove. Reporting the filtering as a warning keeps the user informed without raising a false alarm."),
  P("The two extra steps, traceroute after an Internet failure and a second DNS lookup through 1.1.1.1, add precision where a single test is ambiguous. They turn “the Internet is down” into “the break is inside the ISP after hop 3” and “DNS failed” into “your DNS server is not answering; change it to 1.1.1.1”. These are the follow-up questions an engineer would ask, and they are what makes the answer actionable."),
  P("Exposing the checks through MCP separates evidence from explanation. The tools gather facts deterministically and safely; the model only chooses which tools to call and explains the result. The same server works with Claude Desktop, Claude Code and any other MCP client without change, and because it only reads state, giving it to an assistant carries no risk of the assistant changing the user’s network."),
  P("Some limits remain. On a network that blocks both ICMP and the target’s TCP port, the tool cannot tell a filtered router from a dead one and will report the gateway. Packet Tracer cannot run the software, so the simulated scenes test the method rather than the code; the code was tested with simulated tools and on a real network. Wi-Fi signal is not available on every system."));
push(H2("Practical Implications"));
push(bullet([B("Help desks: "), run("a first-line diagnosis that runs in seconds and states the layer and evidence can be attached to a support ticket, saving the usual scripted questions.")]));
push(bullet([B("Home users and students: "), run("plain-language answers (“your Internet works, but your DNS server is not answering”) with a concrete fix, without knowing any commands.")]));
push(bullet([B("Campus and enterprise IT: "), run("correct behaviour on filtered networks, and warnings that show users why ping fails while the web works.")]));
push(bullet([B("AI assistants: "), run("a safe, read-only toolset that lets any MCP-compatible assistant base network answers on real measurements.")]));
push(bullet([B("Teaching: "), run("the tools map one to one onto the syllabus (ICMP, ARP, DHCP, routing, TCP, DNS, HTTP) and the Packet Tracer scenes let a class watch each layer fail.")]));

// ---------------- Chapter 6
push(chapter(6, "Conclusion and Future Scope"));
push(H2("Conclusion"));
push(P("This case study built a network diagnosis agent that finds the broken layer of a connection with real measurements and explains it in plain words. The netdiag MCP server offers eleven read-only tools covering the physical, data link, network, transport and application layers; the diagnosis engine runs them from the bottom up and stops at the first failure; a CLI runs it without any AI service; and an agent lets Claude choose the tools from a natural-language question."),
  P("The method was verified in a Cisco Packet Tracer network with DHCP, OSPF and DNS: for a shut switch port, a removed OSPF network and a stopped DNS service, the first failing check matched the injected layer, as the real screenshots in Chapter 5 show. On the college Wi-Fi the first version reported a false gateway failure because the campus filters ICMP; the TCP fallback added in this project corrected it, and the same command now passes all nine checks with accurate warnings. All 25 automated tests pass. The project applies the course’s protocols (ICMP, ARP, DHCP, OSPF, TCP, DNS and HTTP) to a practical problem and connects them to current AI tooling through an open standard."));
push(H2("Future Scope"));
["IPv6 diagnosis: test IPv6 reachability and DNS AAAA records separately, and detect broken IPv6 that slows down dual-stack connections.",
  "Continuous mode: run lightweight checks periodically and record a timeline, so intermittent faults such as Wi-Fi drops or evening congestion can be shown with evidence.",
  "Speed and quality measurement: add throughput, bufferbloat and MTU tests to explain slow, rather than broken, connections.",
  "Router-side checks: optional, read-only queries to a home router or managed switch (for example by SNMP) to see the WAN link state.",
  "UDP and QUIC checks, and a check of the configured DNS-over-HTTPS resolver, for networks where TCP 443 alone is not representative.",
  "A remote MCP transport with authentication, so an IT desk can run the diagnosis on a user’s machine with the user’s consent.",
  "Packet Tracer automation: drive the simulated PCs through Packet Tracer’s scripting interface so that the scenes can be run and checked automatically.",
].forEach((t) => push(numbered(t, "future")));

// ---------------- References
push(unnumbered("References"));
[
  "J. F. Kurose and K. W. Ross, Computer Networking: A Top-Down Approach, 8th ed. Hoboken, NJ, USA: Pearson, 2021.",
  "A. S. Tanenbaum, N. Feamster and D. Wetherall, Computer Networks, 6th ed. Harlow, U.K.: Pearson, 2021.",
  "Cisco Networking Academy, “Network Troubleshooting,” in CCNA: Enterprise Networking, Security, and Automation. San Jose, CA, USA: Cisco Systems, 2020.",
  "Anthropic, “Model Context Protocol Specification,” 2025. [Online]. Available: https://modelcontextprotocol.io/specification",
  "J. Case, M. Fedor, M. Schoffstall and J. Davin, “A Simple Network Management Protocol (SNMP),” RFC 1157, IETF, May 1990.",
  "Anthropic, “Tool use with Claude,” Claude API Documentation, 2025. [Online]. Available: https://docs.anthropic.com",
  "J. Postel, “Internet Control Message Protocol,” RFC 792, IETF, Sep. 1981.",
  "D. C. Plummer, “An Ethernet Address Resolution Protocol,” RFC 826, IETF, Nov. 1982.",
  "R. Droms, “Dynamic Host Configuration Protocol,” RFC 2131, IETF, Mar. 1997.",
  "P. Mockapetris, “Domain Names – Implementation and Specification,” RFC 1035, IETF, Nov. 1987.",
  "W. Eddy, Ed., “Transmission Control Protocol (TCP),” RFC 9293, IETF, Aug. 2022.",
  "J. Moy, “OSPF Version 2,” RFC 2328, IETF, Apr. 1998.",
  "M. Steinder and A. S. Sethi, “A survey of fault localization techniques in computer networks,” Science of Computer Programming, vol. 53, no. 2, pp. 165–194, 2004.",
  "S. Yao, J. Zhao, D. Yu, N. Du, I. Shafran, K. Narasimhan and Y. Cao, “ReAct: Synergizing reasoning and acting in language models,” in Proc. Int. Conf. Learning Representations (ICLR), 2023.",
  "T. Schick et al., “Toolformer: Language models can teach themselves to use tools,” in Advances in Neural Information Processing Systems (NeurIPS), vol. 36, 2023.",
  "J. Postel, “Internet Protocol,” RFC 791, IETF, Sep. 1981.",
  "J. Arkko, M. Cotton and L. Vegoda, “IPv4 Address Blocks Reserved for Documentation,” RFC 5737, IETF, Jan. 2010.",
  "Cisco Systems, “Cisco Packet Tracer 9.0,” Cisco Networking Academy, 2025. [Online]. Available: https://www.netacad.com",
  "G. Rodola, “psutil: Cross-platform lib for process and system monitoring in Python,” 2025. [Online]. Available: https://github.com/giampaolo/psutil",
  "dnspython contributors, “dnspython: a DNS toolkit for Python,” 2025. [Online]. Available: https://www.dnspython.org",
  `V. Anbu Chelvan et al., “Network MCP Server with a Diagnosis Agent,” source code repository, 2026. [Online]. Available: ${REPO_URL}`,
].forEach((t) => push(numbered(t, "refs")));

// ---------------- Appendix A
push(unnumbered("Appendix A – Complete Device Configurations"));
CH = "A";
push(H3("A.1 HomeRouter (Cisco 2911)"));
push(...code(readProj("packet-tracer/HomeRouter-config.txt")));
push(H3("A.2 ISPRouter (Cisco 2911)"));
push(...code(readProj("packet-tracer/ISPRouter-config.txt")));
push(H3("A.3 Servers and PCs"));
push(tbl("End-device configuration", [
  ["Device", "Settings"],
  ["DNS-Server", "Static IP 203.0.113.53/24, gateway 203.0.113.1, DNS 203.0.113.53; Services → DNS → On; A record youtube.com → 203.0.113.80"],
  ["youtube.com", "Static IP 203.0.113.80/24, gateway 203.0.113.1; Services → HTTP → On"],
  ["PC0, PC1", "Desktop → IP Configuration → DHCP"],
], [2000, 7026]));
push(H3("A.4 Diagnosis engine (netdiag/diagnose.py)"));
push(...code(readProj("netdiag/diagnose.py", 61, 177)));
push(H3("A.5 MCP client used in the results (mcp_client_demo.py)"));
push(...code(fs.readFileSync(path.join(ROOT, "capture", "mcp_client_demo.py"), "utf8")));

// ---------------- Appendix B
push(unnumbered("Appendix B – Verification Command Guide"));
CH = "B";
push(tbl("Verification commands by layer", [
  ["Layer", "Packet Tracer / Cisco IOS", "netdiag (real computer)", "Healthy result"],
  ["Physical", "show ip interface brief; link lights", "netdiag interfaces; netdiag wifi", "Interface up/up; signal above −70 dBm"],
  ["Data link", "show mac address-table; arp -a on PC", "netdiag arp", "Gateway’s MAC learned"],
  ["Addressing", "ipconfig on PC; show ip dhcp binding", "netdiag ipconfig", "Address from DHCP, gateway set"],
  ["Network (local)", "ping 192.168.1.1", "netdiag ping <gateway>", "Replies (or TCP fallback on filtered networks)"],
  ["Network (routing)", "show ip route; show ip ospf neighbor; tracert", "netdiag routes; netdiag traceroute", "O routes present; neighbour FULL; path complete"],
  ["Transport", "–", "netdiag port youtube.com 443", "open, time in ms"],
  ["Application", "nslookup youtube.com; web browser", "netdiag dns; netdiag http", "Address returned; HTTP 200"],
  ["All", "–", "netdiag diagnose youtube.com", "Everything works"],
], [1500, 2900, 2500, 2126], { size: 19 }));
push(H3("B.2 Restoring the reference network after the demonstration"));
push(...code(`Switch0#  configure terminal
Switch0(config)# interface fa0/1
Switch0(config-if)# no shutdown

ISPRouter# configure terminal
ISPRouter(config)# router ospf 1
ISPRouter(config-router)# network 203.0.113.0 0.0.0.255 area 0

DNS-Server: Services -> DNS -> On
PC1: Desktop -> IP Configuration -> DHCP`));
push(H3("B.3 Running the project"));
push(...code(`git clone ${REPO_URL}.git
cd network-mcp-diagnosis-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[test]"
python -m pytest -q                 # 25 passed
netdiag diagnose youtube.com
claude mcp add network-diagnosis -- $(pwd)/.venv/bin/netdiag-server`));

// ------------------------------------------------------------------ contents, figures, tables lists
const listTable = (head, rows, widths) => grid([head, ...rows], widths, { center: [2], noBorders: true, size: 22 });
const tocRows = TOC.map((t) => [t.no, t.title, pg(t.key)]);
const front = [
  ...bonafide, ...declaration, ...ack, ...abstract,
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [B("TABLE OF CONTENTS", { size: 28 })] }),
  listTable(["Chapter No", "Title", "Page No"], tocRows, [1300, 6526, 1200]),
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [B("LIST OF FIGURES", { size: 28 })] }),
  listTable(["Figure", "Title", "Page"], FIGS.map((f) => [f.no, f.title, pg(f.key)]), [1400, 6726, 900]),
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [B("LIST OF TABLES", { size: 28 })] }),
  listTable(["Table", "Title", "Page"], TABS.map((f) => [f.no, f.title, pg(f.key)]), [1400, 6726, 900]),
  new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [B("LIST OF ABBREVIATIONS", { size: 28 })] }),
  grid([["Abbreviation", "Expansion"], ...ABBR], [2400, 6626], { noBorders: true, size: 22 }),
];
fs.writeFileSync(path.join(HERE, ".keys.json"), JSON.stringify([...TOC, ...FIGS, ...TABS].map((x) => x.key)));

const pageProps = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } };
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] });
const numRef = (ref, text, indent = 720, hanging = 360) => ({ reference: ref, levels: [{ level: 0, format: ref === "bullets" ? LevelFormat.BULLET : LevelFormat.DECIMAL,
  text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: indent, hanging } } } }] });
const doc = new Document({
  creator: "V. Anbu Chelvan", title: "21CSC302J Computer Networks – Network MCP Diagnosis Agent",
  styles: { default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 32, bold: true }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 28, bold: true }, paragraph: { outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 24, bold: true }, paragraph: { outlineLevel: 2 } },
    ] },
  numbering: { config: [numRef("bullets", "•"), numRef("obj", "%1."), numRef("build", "%1."), numRef("future", "%1."), numRef("refs", "[%1]", 720, 720)] },
  sections: [
    { properties: { page: pageProps, titlePage: true }, children: cover },
    { properties: { page: { ...pageProps, pageNumbers: { start: 2, formatType: NumberFormat.LOWER_ROMAN } } }, footers: { default: footer }, children: front },
    { properties: { page: { ...pageProps, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: { default: footer }, children: body },
  ],
});
const out = path.join(ROOT, "CN_Case_Study_Report_Network_MCP_Diagnosis_Agent.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("wrote", out, Math.round(buf.length / 1024), "KB,", FIGS.length, "figures,", TABS.length, "tables"); });
