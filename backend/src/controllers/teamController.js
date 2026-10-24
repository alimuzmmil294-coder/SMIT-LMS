const Team = require("../models/Team");
const Student = require("../models/Student");
const Project = require("../models/Project");
const asyncHandler = require("../utils/asyncHandler");

const listTeams = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const teams = await Team.find()
    .populate("project")
    .sort({ createdAt: -1 });

  let withMembers = await Promise.all(
    teams.map(async (team) => {
      const members = await Student.find({ team: team._id }).select("rollNumber name course batch");
      let leader = null;
      if (team.leader) {
        leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
      }
      if (!leader && team.leader) {
        team.leader = members.length > 0 ? members[0]._id : null;
        await team.save();
        leader = members.length > 0 ? members[0] : null;
      } else if (!leader && !team.leader && members.length > 0) {
        leader = members[0];
        team.leader = leader._id;
        await team.save();
      }

      return {
        ...team.toObject(),
        members,
        memberCount: members.length,
        leaderName: leader ? leader.name : "Not Assigned",
        leaderId: leader ? leader._id : null
      };
    })
  );

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    withMembers = withMembers.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.leaderName?.toLowerCase().includes(q)
    );
  }

  res.json({ success: true, data: withMembers });
});

const getTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id).populate("project");

  if (!team) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  const members = await Student.find({ team: team._id }).sort({ name: 1 });
  let leader = null;
  if (team.leader) {
    leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
  }
  if (!leader && team.leader) {
    team.leader = members.length > 0 ? members[0]._id : null;
    await team.save();
    leader = members.length > 0 ? members[0] : null;
  } else if (!leader && !team.leader && members.length > 0) {
    leader = members[0];
    team.leader = leader._id;
    await team.save();
  }

  res.json({
    success: true,
    data: {
      team: {
        ...team.toObject(),
        members,
        memberCount: members.length,
        leaderName: leader ? leader.name : "Not Assigned",
        leaderId: leader ? leader._id : null
      },
      members,
      memberCount: members.length
    }
  });
});

const createTeam = asyncHandler(async (req, res) => {
  const { name, memberIds = [], leaderId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Team name is required" });
  }

  const validIds = Array.isArray(memberIds)
    ? memberIds.filter((id) => typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/))
    : [];

  let assignedLeaderId = null;
  if (leaderId && typeof leaderId === "string" && leaderId.match(/^[0-9a-fA-F]{24}$/) && validIds.includes(leaderId)) {
    assignedLeaderId = leaderId;
  } else if (validIds.length > 0) {
    assignedLeaderId = validIds[0];
  }

  const team = await Team.create({
    name: name.trim(),
    leader: assignedLeaderId
  });

  if (validIds.length > 0) {
    await Student.updateMany(
      { _id: { $in: validIds } },
      { team: team._id }
    );
  }

  const members = await Student.find({ team: team._id }).select("rollNumber name course batch");
  let leader = null;
  if (team.leader) {
    leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
  }
  if (!leader && members.length > 0) {
    leader = members[0];
  }

  res.status(201).json({
    success: true,
    data: {
      ...team.toObject(),
      members,
      memberCount: members.length,
      leaderName: leader ? leader.name : "Not Assigned",
      leaderId: leader ? leader._id : null
    }
  });
});

const updateTeam = asyncHandler(async (req, res) => {
  const { name, memberIds, leaderId } = req.body;

  const updates = {};
  if (name && name.trim()) {
    updates.name = name.trim();
  }

  const existingTeam = await Team.findById(req.params.id);
  if (!existingTeam) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  let validIds = null;
  if (Array.isArray(memberIds)) {
    validIds = memberIds.filter((id) => typeof id === "string" && id.match(/^[0-9a-fA-F]{24}$/));
    
    // Unassign students removed from team
    await Student.updateMany(
      { team: existingTeam._id, _id: { $nin: validIds } },
      { team: null }
    );
    
    // Assign selected students to team
    if (validIds.length > 0) {
      await Student.updateMany(
        { _id: { $in: validIds } },
        { team: existingTeam._id }
      );
    }
  }

  // Handle leader updates
  if (leaderId && typeof leaderId === "string" && leaderId.match(/^[0-9a-fA-F]{24}$/) && (!validIds || validIds.includes(leaderId))) {
    updates.leader = leaderId;
  } else if (validIds) {
    const currentLeaderId = existingTeam.leader ? existingTeam.leader.toString() : null;
    if (validIds.length > 0) {
      if (!currentLeaderId || !validIds.includes(currentLeaderId)) {
        updates.leader = validIds[0];
      }
    } else {
      updates.leader = null;
    }
  }

  const team = await Team.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  );

  const members = await Student.find({ team: team._id }).select("rollNumber name course batch");
  let leader = null;
  if (team.leader) {
    leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
  }
  if (!leader && members.length > 0) {
    leader = members[0];
  }

  res.json({
    success: true,
    data: {
      ...team.toObject(),
      members,
      memberCount: members.length,
      leaderName: leader ? leader.name : "Not Assigned",
      leaderId: leader ? leader._id : null
    }
  });
});

const deleteTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);

  if (!team) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  // Unassign students linked to deleted team
  await Student.updateMany({ team: team._id }, { team: null });

  await team.deleteOne();

  res.json({ success: true, message: "Team deleted successfully" });
});

const createProject = asyncHandler(async (req, res) => {
  const project = await Project.create(req.body);
  res.status(201).json({ success: true, data: project });
});

const listProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find().sort({ deadline: 1, createdAt: -1 });
  res.json({ success: true, data: projects });
});

const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  const team = await Team.findOne({ project: project._id }).select("name");

  res.json({
    success: true,
    data: { project, team }
  });
});

const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  res.json({ success: true, data: project });
});

const deleteProject = asyncHandler(async (req, res) => {
  const teamUsingProject = await Team.exists({ project: req.params.id });

  if (teamUsingProject) {
    return res.status(409).json({
      success: false,
      message: "Cannot delete a project assigned to a team"
    });
  }

  const project = await Project.findByIdAndDelete(req.params.id);

  if (!project) {
    return res.status(404).json({ success: false, message: "Project not found" });
  }

  res.json({ success: true, message: "Project deleted" });
});

// Add member to team
const addMember = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  const teamId = req.params.id;

  if (!studentId) {
    return res.status(400).json({ success: false, message: "Student ID is required" });
  }

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: "Student not found" });
  }

  // Assign student to team
  student.team = teamId;
  await student.save();

  // If team has no leader, assign this new member as leader
  if (!team.leader) {
    team.leader = student._id;
    await team.save();
  }

  // Fetch updated team data
  const members = await Student.find({ team: teamId }).select("rollNumber name course batch");
  let leader = null;
  if (team.leader) {
    leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
  }
  if (!leader && members.length > 0) {
    leader = members[0];
  }

  res.json({
    success: true,
    data: {
      ...team.toObject(),
      members,
      memberCount: members.length,
      leaderName: leader ? leader.name : "Not Assigned",
      leaderId: leader ? leader._id : null
    }
  });
});

// Remove member from team
const removeMember = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const teamId = req.params.id;

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: "Student not found" });
  }

  // Remove student from team
  student.team = null;
  await student.save();

  // If removed student was the leader, reassign leader
  if (team.leader && team.leader.toString() === studentId.toString()) {
    const remainingMembers = await Student.find({ team: teamId });
    team.leader = remainingMembers.length > 0 ? remainingMembers[0]._id : null;
    await team.save();
  }

  // Fetch updated team data
  const members = await Student.find({ team: teamId }).select("rollNumber name course batch");
  let leader = null;
  if (team.leader) {
    leader = members.find((m) => m._id.toString() === team.leader.toString()) || null;
  }
  if (!leader && members.length > 0) {
    leader = members[0];
  }

  res.json({
    success: true,
    data: {
      ...team.toObject(),
      members,
      memberCount: members.length,
      leaderName: leader ? leader.name : "Not Assigned",
      leaderId: leader ? leader._id : null
    }
  });
});

// Change team leader
const changeLeader = asyncHandler(async (req, res) => {
  const { leaderId } = req.body;
  const teamId = req.params.id;

  if (!leaderId) {
    return res.status(400).json({ success: false, message: "Leader ID is required" });
  }

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({ success: false, message: "Team not found" });
  }

  const leader = await Student.findById(leaderId);
  if (!leader) {
    return res.status(404).json({ success: false, message: "Student not found" });
  }

  if (leader.team?.toString() !== teamId) {
    return res.status(400).json({ 
      success: false, 
      message: "Selected student is not a member of this team" 
    });
  }

  // Persist updated leader in the team document
  team.leader = leader._id;
  await team.save();

  // Get all members and reorder so leader is first
  const allMembers = await Student.find({ team: teamId }).select("rollNumber name course batch");
  const members = [
    leader,
    ...allMembers.filter((m) => m._id.toString() !== leaderId.toString())
  ];

  res.json({
    success: true,
    data: {
      ...team.toObject(),
      members,
      memberCount: members.length,
      leaderName: leader.name,
      leaderId: leader._id
    }
  });
});

module.exports = {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  changeLeader,
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject
};
