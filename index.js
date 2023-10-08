const express = require('express')
const cors = require('cors')
require('dotenv').config()
const mongodb = require('mongodb')
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt');
const saltRounds = 10;
const multer = require('multer')
const path = require('path')
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { format } = require('date-fns')

const app = express()
const port = process.env.PORT || 5000;

// middlewares
app.use(express.json())
app.use(express.static('public'))
app.use(cors({
    origin: ["http://localhost:5173", "http://134.209.64.241"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    
}))
app.use(cookieParser())


const MongoClient = mongodb.MongoClient
// connect to our databse
const connectOurDatabse = async () => {

    const client = await MongoClient.connect(process.env.MONGO_URI)
    const users = client.db('voytek').collection('users')
    const allProjects = client.db('voytek').collection('allProjects')

    // add new project
    app.post('/add-project', async (req, res) => {
        const projectData = req.body
        const result = await allProjects.insertOne(projectData)
        res.send(result)
    })
    app.delete('/delete-project',async(req,res)=>{
        const projectID = req.body.projecId
        const result = await allProjects.deleteOne({_id : projectID})
        res.send(result)
    })
    app.get('/total-projects', async (req, res) => {
        const totalProjects = await allProjects.estimatedDocumentCount()
        res.send({ totalProjects })
    })

    app.get('/all-projects', async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * 8;
        const totalProjects = await allProjects.find().toArray()
        const reverse = totalProjects.reverse();
        const projects = reverse.slice(skip, skip + 8)
        res.send(projects)
    })

    // get single project total logs count
    app.get('/total-logs/:id', async (req, res) => {
        const projectId = req.params.id
        const logStatus = req.query.logStatus;
        const singleProject = await allProjects.findOne({ _id: projectId })

        if (!singleProject) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const filteredLogs = singleProject.project_logs.filter(log => log.log_status === logStatus)

        const totalLogs = filteredLogs.length;
        res.send({ totalLogs })
    })

    // get single project logs by id
    app.get('/single-project/:id', async (req, res) => {
        const projectId = req.params.id
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * 4;
        const logStatus = req.query.logStatus;

        const singleProject = await allProjects.findOne({ _id: projectId })

        if (!singleProject) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const filteredLogs = singleProject.project_logs.filter(log => log.log_status === logStatus)

        const projectLogs = filteredLogs.reverse().slice(skip, skip + 4);
        res.send(projectLogs)
    })

    // add a new log 
    app.patch('/add-log', async (req, res) => {
        const projectId = req.body.id
        const logData = req.body.logData

        const response = await allProjects.updateOne(
            { _id: projectId },
            { $push: { project_logs: logData } }
        )
        res.send(response)
    })

    // Configure multer to specify where to store uploaded files
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'public/images'); // Destination folder for uploaded files
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + path.extname(file.originalname);
            cb(null, file.fieldname + '-' + uniqueSuffix);
        },
    });
    const upload = multer({ storage });

    // image upload and set assing value for assign log
    app.post('/uploadImage', upload.single('image'), async (req, res) => {
        const projectId = req.query.projectId;
        const logId = req.query.logId;

        const name = req.query.name;
        const assinged_person_id = req.query.id;
        const image = req.file.filename
        const data = {
            name,
            image,
            assinged_person_id
        }

        const result = await allProjects.updateOne(
            { _id: projectId, 'project_logs.log_id': logId }, {
            $push: {
                'project_logs.$.assigned': data
            }
        });
        res.send(result)
    });

    // get all assinged data for suggest show 
    app.get('/get-assigned-data', async (req, res) => {
        try {
            const searchQuery = req.query.searchQuery || '';
            const assignedData = await allProjects.aggregate([
                {
                    $unwind: '$project_logs',
                },
                {
                    $project: {
                        _id: 0,
                        assigned: '$project_logs.assigned',
                    },
                },
            ]).toArray();
            let filteredData = assignedData;
            // Apply filtering only if a search query is provided
            if (searchQuery) {
                filteredData = assignedData.filter((item) => {
                    const assigned = item.assigned;
                    return assigned && assigned[0].name && assigned[0].name.toLowerCase().includes(searchQuery.toLowerCase());
                });
            }
            res.send(filteredData);
        } catch (error) {
            console.log(error)
        }
    });

    // filter log by date range
    app.post('/filter-logs', async (req, res) => {
        const projectId = req.body.projectId;
        const startDate = req.body.startDate || '2000-01-01';
        const endDate = req.body.endDate || '2100-12-31';
        const allUpcomingStart = req.body.allUpcomingStart;
        const allUpcomingEnd = req.body.allUpcomingEnd;
        const overDueStart = req.body.overDueStart;
        const overDueEnd = req.body.overDueEnd;

        const descriptionContent = req.body.descriptionContent || null;

        const logTagsToFilter = req.body.logTagsToFilter || [];
        const logTypeToFilter = req.body.logTypeToFilter || null;
        const assignedPersonId = req.body.assignedPersonId || null;

        // Define the conditions for the $match stage
        const matchConditions = [];

        // Add date range condition if startDate and endDate are provided by user
        if (startDate && endDate) {
            matchConditions.push({
                'project_logs.log_due_date': {

                    $gte: startDate,
                    $lte: endDate,
                },
            });
        }
        if (allUpcomingStart && allUpcomingEnd) {
            matchConditions.push({
                'project_logs.log_due_date': {

                    $gte: allUpcomingStart,
                    $lte: allUpcomingEnd,
                },
            });
        }
        if (overDueStart && overDueEnd) {
            matchConditions.push({
                'project_logs.log_due_date': {

                    $gte: overDueStart,
                    $lte: overDueEnd,
                },
            });
        }

        if (descriptionContent) {
            matchConditions.push({
                $or: [
                    {
                        'project_logs.log_description.control_description.content': {
                            $regex: descriptionContent,
                            $options: 'i'
                        },
                    },
                    {
                        'project_logs.log_description.risk_description.content': {
                            $regex: descriptionContent,
                            $options: 'i'
                        },
                    },
                    {
                        'project_logs.log_description.action_description.content': {
                            $regex: descriptionContent,
                            $options: 'i'
                        },
                    },
                ],
            });
        }

        if (logTagsToFilter.length > 0) {
            matchConditions.push({
                'project_logs.log_tags': { $in: logTagsToFilter },
            });
        }
        if (logTypeToFilter) {
            matchConditions.push({
                'project_logs.log_type': logTypeToFilter,
            });
        }
        if (assignedPersonId) {
            matchConditions.push({
                'project_logs.assigned.assinged_person_id': assignedPersonId,
            });
        }
        // Construct the $match stage based on user-defined conditions
        const matchStage = matchConditions.length > 0 ? { $match: { $and: matchConditions } } : {};

        const result = await allProjects.aggregate([
            {
                $unwind: '$project_logs', // Flatten the project_logs array
            },
            {
                $addFields: {
                    // Convert log_due_date to a string in the format 'YYYY-MM-DD'
                    'project_logs.log_due_date': {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: {
                                $toDate: {
                                    $substr: ['$project_logs.log_due_date', 0, 10], // Extract YYYY-MM-DD portion
                                },
                            },
                        },
                    },
                },
            },
            matchStage, // Apply the dynamically constructed $match stage
        ]).toArray();

        const specificProjectLogs = result.filter(projectLog => projectLog._id === projectId)
        const logsArray = specificProjectLogs.map((project) => project.project_logs);

        if (req.body.totalLogs) {
            const filteredLogs = logsArray.filter(log => log.log_status === req.body.logStatus)
            const totalLogs = filteredLogs.length;
            return res.send({ totalLogs })
        }

        const page = req.body.page;
        const skip = (page - 1) * 4;
        const filteredLogs = logsArray.filter(log => log.log_status === req.body.logStatus)
        const projectLogs = filteredLogs.slice(skip, skip + 4);
        res.send(projectLogs);
    });

    app.post('/download-logs-pdf', async (req, res) => {
        const logs = req.body;

        // Create a new PDF document
        const doc = new PDFDocument();

        // Set the response header to indicate a PDF file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=log_data.pdf');

        // Pipe the PDF document to both the response and the file system
        doc.pipe(res);

        // Loop through each log and add it as a row in the PDF
        for (const log of logs) {
            doc.fontSize(16).text(`Log Name - ${log.log_name}`);
            doc.fontSize(16).text(`Log Type - ${log.log_type}`);
            doc.fontSize(16).text(`Log Due Date - ${format(new Date(log.log_due_date), "dd/MM/y")}`);
            doc.fontSize(16).text(`Assigned Name - ${log.assigned[0].name}`);
            doc.fontSize(16).text(`Log Type - ${log.log_type}`);
            doc.fontSize(16).text(`Log Status - ${log.log_status}`);
            doc.fontSize(16).text(`Log Tags - ${log.log_tags.join(', ')}`);
            doc.moveDown();
            doc.moveDown();
            doc.moveDown();
            doc.moveDown();
        }

        // Finalize and close the PDF
        doc.end();
        // console.log('PDF generated and saved as "log_data.pdf"');
    })

    app.post('/download-logs-excel', async (req, res) => {
        const logs = req.body

        // Create a new Excel workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Logs');

        // Define the column headers
        worksheet.columns = [
            { header: 'Log Name', key: 'log_name', width: 20 },
            { header: 'Log ID', key: 'log_id', width: 15 },
            { header: 'Log Type', key: 'log_type', width: 15 },
            { header: 'Log Due Date', key: 'log_due_date', width: 20 },
            { header: 'Log Status', key: 'log_status', width: 15 },
            { header: 'Log Tags', key: 'log_tags', width: 30 },
            { header: 'Assigned Name', key: 'assigned_name', width: 20 },
        ];

        // Add log data to the worksheet
        logs.forEach((log) => {
            const row = {
                log_name: log.log_name,
                log_id: log.log_id,
                log_type: log.log_type,
                log_due_date: log.log_due_date,
                log_status: log.log_status,
                log_tags: log.log_tags.join(', '),
                assigned_name: log.assigned[0].name,
            };
            worksheet.addRow(row);
        });

        // Generate an Excel file buffer
        const excelBuffer = await workbook.xlsx.writeBuffer();

        // Set the response headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.xlsx');

        // Send the Excel buffer to the client
        res.send(excelBuffer);
    })

    // get single project logs by id
    app.get('/get-single-log', async (req, res) => {
        const logId = req.query.logId
        const projectId = req.query.projectId

        const singleProject = await allProjects.findOne({ _id: projectId })

        const singleLog = singleProject.project_logs.find(log => log.log_id === logId)

        res.send(singleLog)
    })

    app.post('/add-descriptions', async (req, res) => {
        const logId = req.body.logId;
        const projectId = req.body.projectId;
        const taskType = req.body.taskType;

        const riskDescription = req.body.riskDescriptionObj;
        const actionDescription = req.body.actionDescriptionObj;
        const controlDescription = req.body.controlDescriptionObj;

        if (taskType === "Risk") {
            const result = await allProjects.updateOne(
                { _id: projectId, 'project_logs.log_id': logId },
                {
                    $push: {
                        'project_logs.$.log_description.risk_description': riskDescription,
                        'project_logs.$.log_description.control_description': controlDescription,
                    }
                }
            );

            res.send(result);
        }
        if (taskType === "Action") {
            const result = await allProjects.updateOne(
                { _id: projectId, 'project_logs.log_id': logId },
                {
                    $push: {
                        'project_logs.$.log_description.action_description': actionDescription,
                        'project_logs.$.log_description.control_description': controlDescription,
                    }
                }
            );

            res.send(result);
        }
    });

    app.post('/update-log-status', async (req, res) => {
        const projectId = req.body.projectId
        const logId = req.body.logId

        const result = await allProjects.updateOne(

            { _id: projectId, 'project_logs.log_id': logId },
            { $set: { 'project_logs.$.log_status': "closed" } }
        );

        res.send(result)
    })

    app.put('/update-single-description', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const descriptionId = req.body.descriptionId;
        const taskType = req.body.taskType;
        const descriptionContent = req.body.descriptionContent;

        if (taskType === "Control") {
            const result = await allProjects.updateOne(
                { _id: projectId, "project_logs.log_id": logId },
                { $set: { "project_logs.$.log_description.control_description.$[element].content": descriptionContent } },
                { arrayFilters: [{ "element.id": descriptionId }] }
            );
            return res.send(result)
        }

        if (taskType === "Risk") {
            const result = await allProjects.updateOne(
                { _id: projectId, "project_logs.log_id": logId },
                { $set: { "project_logs.$.log_description.risk_description.$[element].content": descriptionContent } },
                { arrayFilters: [{ "element.id": descriptionId }] }
            );
            return res.send(result)
        }
        if (taskType === "Action") {
            const result = await allProjects.updateOne(
                { _id: projectId, "project_logs.log_id": logId },
                { $set: { "project_logs.$.log_description.action_description.$[element].content": descriptionContent } },
                { arrayFilters: [{ "element.id": descriptionId }] }
            );
            return res.send(result)
        }
    })

    app.put('/update-log-name', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const logName = req.body.logName;

        const result = await allProjects.updateOne(
            { _id: projectId, "project_logs.log_id": logId },
            { $set: { "project_logs.$.log_name": logName } },
        );
        return res.send(result)
    })
    app.put('/update-log-due-date', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const logDueDate = req.body.logDueDate;

        const result = await allProjects.updateOne(
            { _id: projectId, "project_logs.log_id": logId },
            { $set: { "project_logs.$.log_due_date": logDueDate } },
        );
        return res.send(result)
    })

    app.put('/update-log-type', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const logType = req.body.logType;

        if (logType) {
            const result = await allProjects.updateOne(
                { _id: projectId, "project_logs.log_id": logId },
                { $set: { "project_logs.$.log_type": logType } },
            );
            return res.send(result)
        }
    })

    app.put('/update-log-tags', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const logTags = req.body.logTags;

        const result = await allProjects.updateOne(
            { _id: projectId, "project_logs.log_id": logId },
            { $set: { "project_logs.$.log_tags": logTags } },
        );
        return res.send(result)
    })

    app.put('/update-assigned-data', async (req, res) => {
        const projectId = req.body.projectId;
        const logId = req.body.logId;
        const assigned = req.body.assigned;

        const result = await allProjects.updateOne(
            { _id: projectId, "project_logs.log_id": logId },
            { $set: { "project_logs.$.assigned": assigned } },
        );
        return res.send(result)
    })

    // users related apis
    app.get('/users', async (req, res) => {
        const user = await users.find().toArray()
        res.send(user)
    })


    app.post('/change-password', async (req, res) => {
        const email = req.body.email
        const updatedPass = req.body.password;
        const filter = { email: email };

        bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(updatedPass, salt, async (err, hash) => {
                const updateDocument = {
                    $set: {
                        password: hash,
                    },
                };
                const result = await users.updateOne(filter, updateDocument);
                res.send(result)
            });
        });
    })

    // authentication related apis
    const verifyUser = (req, res, next) => {
        const token = req.query.token;

        if (!token) {
            return res.send({ error: true, message: 'Unauthorized access' })
        }
        else {
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
                if (error) {
                    return res.send({ error: true, message: 'Forbidden access' })
                }
                else {
                    req.email = decoded.email;
                    next()
                }
            })
        }
    }

    app.get('/get-user', verifyUser, async (req, res) => {
        const email = req.email;

        if (email) {
            const user = await users.findOne({ email: email })
            const userData = { userId: user._id, name: user.name, email: user.email }
            return res.send({ status: "success", message: "User getting successful", userData: userData })
        }
    })

    app.post('/signup', async (req, res) => {
        const user = req.body;

        bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(user.password, salt, async (err, hash) => {
                const result = await users.insertOne({ name: user.name, email: user.email, password: hash })
                res.send({ status: "success", message: "User signup successful" })
            });
        });
    })

    app.post('/login', async (req, res) => {
        const email = req.body.email;
        const password = req.body.password;
        const user = await users.findOne({ email: email })

        if(!user){
            return res.send({message: "user not found"})
        }
        const hash = user.password;
        const userData = { userId: user._id, name: user.name, email: user.email }

        bcrypt.compare(password, hash, (err, result) => {
            if (!result) return res.send({ error: true, message: 'Password did not matched' })

            if (result) {

                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
                // res.cookie('token', token)

                return res.send({ status: "success", message: "User login successful", userData: userData, token: token })
            }
        });
    })
}
connectOurDatabse()
app.get('/', (req, res) => {
    res.send("Voytek server is running..")
})

app.listen(port, () => {
    console.log(`Voytek server is listening to port ${port}`)
})