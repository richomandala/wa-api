const router = require('express').Router();
const { MessageMedia, Location } = require("whatsapp-web.js");
const request = require('request')
const vuri = require('valid-url');
const fs = require('fs');
const formidable = require('formidable');
const moment = require('moment');

const parseForm = async function(req) {
    return new Promise((resolve, reject) => {
        try {
            const form = new formidable.IncomingForm();
            form.parse(req, function (err, fields, files) {
                if (err) {
                    reject(err.message);
                } else {
                    resolve({
                        error: false,
                        message: null,
                        data: {
                            fields: fields,
                            files: files
                        }
                    });
                }
            });
        } catch (error) {
            reject(error.message);
        }
    }).catch(err => {
        return {
            error: true,
            message: err,
            data: null
        };
    });
}

const bufferToFile = async (buffer, filename) => {
    return new Promise((resolve, reject) => {
        try {
            fs.writeFile(filename, buffer, function(err) {
                if (err) {
                    reject(err.message);
                } else {
                    resolve({
                        error: false,
                        message: null
                    });
                }
            });
        } catch (error) {
            reject(error.message);
        }
    }).catch(err => {
        return {
            error: true,
            message: err
        };
    });
}

const dataToExcel = async (filename, data, heading = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            const xl = require('excel4node');
            const wb = new xl.Workbook();
            const ws = wb.addWorksheet('Sheet 1');

            const headerStyle = wb.createStyle({
                font: {
                    bold: true
                },
                alignment: {
                    horizontal: 'center'
                },
                fill: {
                    type: 'pattern',
                    patternType: 'solid',
                    bgColor: '#4472c4',
                    fgColor: '#4472c4'
                }
            });

            if (heading != null && (typeof heading == 'object' || typeof heading == 'array') && heading.length > 0) {
                for (let i = 0; i < heading.length; i++) {
                    ws.cell(1, i + 1).string(heading[i]);
                    ws.cell(1, i + 1).style(headerStyle);
                }
            }

            for (let i = 0; i < data.length; i++) {
                for (let j = 0; j < data[i].length; j++) {
                    ws.cell(i + 2, j + 1).string(data[i][j]);
                }
            }

            await wb.write(filename);
            resolve({
                error: false,
                message: null
            });
        } catch (error) {
            reject(error.message);
        }
    }).catch(err => {
        return {
            error: true,
            message: err
        };
    });
}

const mediadownloader = (url, path, callback) => {
    request.head(url, (err, res, body) => {
      request(url)
        .pipe(fs.createWriteStream(path))
        .on('close', callback)
    })
}

const sendMessage = async (phone, message) => {
    return new Promise(async (resolve, reject) => {
        try {
            await client.isRegisteredUser(`${phone}@c.us`).then(async (is) => {
                if (is) {
                    await client.sendMessage(phone + '@c.us', message).then(async (response) => {
                        if (response.id.fromMe) {
                            await client.getChatById(`${phone}@c.us`).then(async (chat) => {
                                let status = "";
                                if (chat.lastMessage.ack == 1) {
                                    status = "Checklist 1";
                                } else if (chat.lastMessage.ack == 2) {
                                    status = "Checklist 2";
                                } else if (chat.lastMessage.ack == 3) {
                                    status = "Read";
                                } else {
                                    status = "Unknown. Please check manually on WhatsApp";
                                }

                                resolve({
                                    error: false,
                                    message: null,
                                    data: {
                                        status: status,
                                        message: `Message successfully sent to ${phone}`
                                    }
                                });
                            }).catch(() => {
                                resolve({
                                    error: false,
                                    message: null,
                                    data: {
                                        status: "Unknown. Please check manually on WhatsApp",
                                        message: `Message successfully sent to ${phone}`
                                    }
                                });
                            })
                        } else {
                            reject('Error sending message');
                        }
                    }).catch((err) => {
                        reject(err);
                    })
                } else {
                    reject(`${phone} is not a whatsapp user`);
                }
            })
        } catch (error) {
            reject(error.message)
        }
    }).catch((err) => {
        return {
            error: true,
            message: err,
            data: null
        }
    });
}

router.post('/sendmessage/bulk', async (req,res) => {
    try {
        const form = await parseForm(req);
        if (form.error) {
            throw new Error(form.message);
        } else {
            if (!form.data.files.file) {
                throw new Error("File not found");
            }

            if (form.data.files.file.mimetype != 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                throw new Error("Invalid file type");
            }

            const xlsx = require('node-xlsx');
            const xlsxjson = require('convert-excel-to-json');

            const randomname = moment().format('YYYYMMDDHHmmss') + "_" + Math.random().toString(36).substring(7);
            const path = process.cwd() + '/temp/' + randomname + '.xlsx';

            const buffer = fs.readFileSync(form.data.files.file.filepath);
            const save = await bufferToFile(buffer, path);
            if (save.error) {
                throw new Error(save.message);
            }

            let sheetname = null;
            const worksheet = xlsx.parse(path);
            if (worksheet.length > 0) {
                sheetname = worksheet[0].name;
            } else {
                throw new Error("Invalid excel file");
            }

            const exceldata = xlsxjson({
                sourceFile: path,
                header: {
                    rows: 3
                },
                sheets: [sheetname]
            });
            
            let result = [];
            const data = exceldata[sheetname];
            
            for (let i = 0; i < data.length; i++) {
                let send = await sendMessage(data[i].A, data[i].B);
                if (send.error) {
                    result.push([data[i].A, data[i].B, "Error", send.message, ""]);
                } else {
                    result.push([data[i].A, data[i].B, "Success", send.data.message, send.data.status]);
                }
            }

            const resultpath = process.cwd() + '/temp/' + randomname + '_result.xlsx';
            const excel = await dataToExcel(resultpath, result, ['No', 'Message', 'Status', 'Keterangan', 'Status Pesan']);
            if (excel.error) {
                res.send({
                    status: "success",
                    message: "Bulk message successfully processed. But error when creating excel result. Please check manually on WhatsApp"
                })
            } else {
                let max_attempts = 3;
                let attempts = 0;
                let send = false;
                while (!send) {
                    attempts++;
                    if (fs.existsSync(resultpath)) {
                        const stream = fs.createReadStream(resultpath);
                        send = true;
                        stream.pipe(res);
                    } else {
                        if (attempts >= max_attempts) {
                            send = true;
                            res.send({
                                status: "success",
                                message: "Bulk message successfully processed. But error when creating excel result. Please check manually on WhatsApp"
                            })
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                }       
            }
        }
    } catch (error) {
        res.send({ status: "error", message: error.message })
    }
});

router.post('/sendmessage/:phone', async (req,res) => {
    try {
        let phone = req.params.phone;
        let message = req.body.message;
        if (phone == undefined || message == undefined) {
            res.send({ status:"error", message:"please enter valid phone and message" })
        } else {
            const send = await sendMessage(phone, message);
            if (send.error) {
                res.send({ status: "error", message: send.message, status_pesan: null });
            } else {
                res.send({ status: "success", message: send.data.message, status_pesan: send.data.status });
            }
        }
    } catch (error) {
        res.send({ status: "error", message: error.message })
    }
});

router.post('/sendimage/:phone', async (req,res) => {
    var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

    let phone = req.params.phone;
    let image = req.body.image;
    let caption = req.body.caption;

    if (phone == undefined || image == undefined) {
        res.send({ status: "error", message: "please enter valid phone and base64/url of image" })
    } else {
        if (base64regex.test(image)) {
            let media = new MessageMedia('image/png',image);
            client.sendMessage(`${phone}@c.us`, media, { caption: caption || '' }).then((response) => {
                if (response.id.fromMe) {
                    res.send({ status: 'success', message: `MediaMessage successfully sent to ${phone}` })
                }
            }).catch((err) => {
                res.send({ status: 'error', message: err })
            });
        } else if (vuri.isWebUri(image)) {
            if (!fs.existsSync('./temp')) {
                await fs.mkdirSync('./temp');
            }

            var path = './temp/' + image.split("/").slice(-1)[0]
            mediadownloader(image, path, () => {
                let media = MessageMedia.fromFilePath(path);
                
                client.sendMessage(`${phone}@c.us`, media, { caption: caption || '' }).then((response) => {
                    if (response.id.fromMe) {
                        res.send({ status: 'success', message: `MediaMessage successfully sent to ${phone}` })
                        try {
                          fs.unlinkSync(path);
                        } catch (error) {
                          console.log(error);
                        }
                    }
                }).catch((err) => {
                    res.send({ status: 'error', message: err })
                });
            })
        } else {
            res.send({ status:'error', message: 'Invalid URL/Base64 Encoded Media' })
        }
    }
});

router.post('/sendpdf/:phone', async (req,res) => {
    var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

    let phone = req.params.phone;
    let pdf = req.body.pdf;

    if (phone == undefined || pdf == undefined) {
        res.send({ status: "error", message: "please enter valid phone and base64/url of pdf" })
    } else {
        if (base64regex.test(pdf)) {
            let media = new MessageMedia('application/pdf', pdf);
            client.sendMessage(`${phone}@c.us`, media).then((response) => {
                if (response.id.fromMe) {
                    res.send({ status: 'success', message: `MediaMessage successfully sent to ${phone}` })
                }
            });
        } else if (vuri.isWebUri(pdf)) {
            if (!fs.existsSync('./temp')) {
                await fs.mkdirSync('./temp');
            }

            var path = './temp/' + pdf.split("/").slice(-1)[0]
            mediadownloader(pdf, path, () => {
                let media = MessageMedia.fromFilePath(path);
                client.sendMessage(`${phone}@c.us`, media).then((response) => {
                    if (response.id.fromMe) {
                        res.send({ status: 'success', message: `MediaMessage successfully sent to ${phone}` })
                        try {
                          fs.unlinkSync(path);
                        } catch (error) {
                          console.log(error);
                        }
                    }
                });
            })
        } else {
            res.send({ status: 'error', message: 'Invalid URL/Base64 Encoded Media' })
        }
    }
});

router.post('/sendlocation/:phone', async (req, res) => {
    let phone = req.params.phone;
    let latitude = req.body.latitude;
    let longitude = req.body.longitude;
    let desc = req.body.description;

    if (phone == undefined || latitude == undefined || longitude == undefined) { 
        res.send({ status: "error", message: "please enter valid phone, latitude and longitude" })
    } else {
        let loc = new Location(latitude, longitude, desc || "");
        client.sendMessage(`${phone}@c.us`, loc).then((response)=>{
            if (response.id.fromMe) {
                res.send({ status: 'success', message: `MediaMessage successfully sent to ${phone}` })
            }
        });
    }
});

router.get('/getchatbyid/:phone', async (req, res) => {
    let phone = req.params.phone;
    if (phone == undefined) {
        res.send({status:"error",message:"please enter valid phone number"});
    } else {
        client.getChatById(`${phone}@c.us`).then((chat) => {
            res.send({ status:"success", message: chat });
        }).catch(() => {
            console.error("getchaterror")
            res.send({ status: "error", message: "getchaterror" })
        })
    }
});

router.get('/getchats', async (req, res) => {
    client.getChats().then((chats) => {
        res.send({ status: "success", message: chats});
    }).catch(() => {
        res.send({ status: "error",message: "getchatserror" })
    })
});

module.exports = router;