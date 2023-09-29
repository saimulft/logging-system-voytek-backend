
const express = require('express')
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000
const multer = require('multer')
const path = require('path')
const mongodb = require('mongodb')
const { ObjectId } = require('mongodb')
// middleware
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))


const MongoClient = mongodb.MongoClient

// connect to our databse 
const connectOurDatabse = async () => {

    const client = await MongoClient.connect(process.env.MONGO_URI)
    const users = client.db('voytek').collection('users')
    const allProjects = client.db('voytek').collection('allProjects')
    const demoProjects = client.db('voytek').collection('demoProjects')
    const imagesCollection = client.db('voytek').collection('images')

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



    // add new  project
    app.post('/addProject', async (req, res) => {
        const projectData = req.body.data
        const response = await demoProjects.insertOne(projectData)
        res.send(response)
    })

    // add a new log 
    app.patch('/addLog', async (req, res) => {
        // log data exdmple 
        // "logData": 
        // {
        //           "log_name": "fixing",
        //           "log_id": "343ll343",
        //           "log_description": {
        //               "risk_description": [
        //                   {
        //                       "content": "risk description content",
        //                       "date": "2023-04-02T00:00:00Z",
        //                       "id": "3443433322"
        //                   }
        //               ],
        //               "control_description": [
        //                   {
        //                       "content": "risk control content",
        //                       "date": "2023-07-02T00:00:00Z",
        //                       "id": "3434333322"
        //                   }
        //               ]
        //           },
        //           "description_date": "2023-04-02T00:00:00Z",
        //           "log_type": "Risk",
        //           "log_due_date": "2023-04-02T00:00:00Z",
        //           "log_status": "open",
        //           "log_tags": [
        //               "development",
        //               "tech",
        //               "web"
        //           ],
        //           "assigned": []
        //       }
        const logData = req.body.logData
        const response = await demoProjects.updateOne(
            { _id: ("65150ee5dad0c2347337220ewe") },
            { $push: { project_logs: logData } }
        )
        res.send(response)
    })


    // image upload and set assing value for assign log
    app.post('/uploadImage', upload.single('image'), async (req, res) => {
        const name = "torikul islam"
        const image = req.file.filename
        const assinged_person_id = 3433
        const data = {
            name,
            image,
            assinged_person_id
        }
        const result = await demoProjects.updateOne(
            { _id: ("65150ee5dad0c2347337220ewe") }, {
            $push: {
                'project_logs.0.assigned': data, // Update the image URL
            }
        }
        );
        res.send(result)
    });


    // update log description and control description
    app.post('/addDescriptions', async (req, res) => {
        const logId = req.body.logId;
        // const { riskDescription, controlDescription } = req.body;
        const riskDescription = {
            content: "risk control content heloo",
            date: "2023-07-02T00:00:00Z",
            id: "34343333224"
        }
        const controlDescription = {
            content: "risk control content good bye",
            date: "2023-07-02T00:00:00Z",
            id: "34343333242"
        }

        // Update the document with the new risk and control descriptions
        const result = await demoProjects.updateOne(
            { _id: logId },
            {
                $push: {
                    'project_logs.0.log_description.risk_description': riskDescription,
                    'project_logs.0.log_description.control_description': controlDescription,
                }
            }
        );

        res.send(result);

    });

    // filter log by date range
    app.get('/filterLog', async (req, res) => {
        const startDate = req.body.startDate || '2000-01-01';
        const endDate = req.body.endDate || '2100-12-31';
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
                'project_logs.assigned.assigned_person_id': assignedPersonId,
            });
        }
        // Construct the $match stage based on user-defined conditions
        const matchStage = matchConditions.length > 0 ? { $match: { $and: matchConditions } } : {};

        const result = await demoProjects.aggregate([
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

        res.send(result);
    });




    // get all users
    app.get('/users', async (req, res) => {
        const user = await users.find().toArray()
        res.send(user)
    })
    // get all projects
    app.get('/allProjects', async (req, res) => {
        const projects = await allProjects.find().toArray()
        res.send(projects)
    })

    // get all demo project
    app.get('/demoProject', async (req, res) => {
        const projects = await demoProjects.find().toArray()
        res.send(projects)
    })

    // get single project by id
    app.get('/singleProject/:id', async (req, res) => {
        const projectId = req.params.id
        const singleProject = await allProjects.findOne({ _id: new ObjectId(projectId) })
        res.send(singleProject.project_logs)

    })

    //   update specific log information
    // app.patch('/updateLog', async (req, res) => {
    //     const log_desc = req.body.log_desc
    //     const result = await demoProjects.updateOne(
    //         { _id: new ObjectId("65150ee5dad0c2347337220e"), 'project_logs.log_id': '343ll343' },
    //         { $set: { 'project_logs.$.log_description': log_desc } }
    //     )
    //     res.send(result)
    // })


}
connectOurDatabse()




app.get('/', (req, res) => {
    res.send('voytek server running')
})
app.listen(port, () => console.log('voytek server running on port 3000'))

